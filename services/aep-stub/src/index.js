/**
 * AEP Stub — CXone Device Signal Bridge
 *
 * MOCK: Minimal stand-in for the real NICE AEP (Agentic Engagement Plane).
 * Implements just enough of the 4 AEP contracts to make the demo narrative true:
 *   1. POST /ingest       — receives normalised AEP events, creates/updates Threads
 *   2. GET  /context/:id  — returns full thread history + device payload
 *   3. POST /handover     — marks a thread as escalated to human agent
 *   4. GET  /threads      — lists all threads (for demo dashboard)
 *
 * Real implementation: orch-entity-thread service + aep-handler-registry in NICE GHE.
 * Swap config/env.json to point event-normalizer at the real AEP Kinesis HTTP proxy
 * when switching to Path A — no code changes required here.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const configDir = path.join(__dirname, '..', 'config');
const configFile = fs.existsSync(path.join(configDir, 'env.local.json'))
  ? path.join(configDir, 'env.local.json')
  : path.join(configDir, 'env.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
console.log(`[aep-stub] Using config: ${configFile}`);

const PORT = config.AEP_STUB_PORT || 3002;
const TRIAGE_URL = config.COGNIGY_TRIAGE_URL || 'http://cognigy-triage:3003/triage';

// ─── In-memory Thread store ───────────────────────────────────────────────────
// MOCK: real implementation is orch-entity-thread (DynamoDB-backed Thread records)
const threads = {}; // threadId → ThreadRecord

function getOrCreateThread(contactKey, channelType) {
  // One Thread per contactKey (customerId:deviceId) — idempotent
  const existing = Object.values(threads).find(t => t.contactKey === contactKey);
  if (existing) return existing;

  const thread = {
    threadId:    uuidv4(),
    contactKey,
    channelType,
    status:      'open',
    createdAt:   new Date().toISOString(),
    events:      [],
    handover:    null,
  };
  threads[thread.threadId] = thread;
  console.log(`[aep-stub] Created thread ${thread.threadId} for contactKey=${contactKey}`);
  return thread;
}

// ─── Engagement Path evaluator ────────────────────────────────────────────────
const engagementPaths = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'engagement-paths.json'), 'utf8')
);

function getHandlers(channelType) {
  const route = engagementPaths.routes.find(r => r.channelType === channelType);
  return route ? route.handlers : [];
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// CORS for agent-context-panel
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aep-stub' }));

// List all threads (demo dashboard)
app.get('/threads', (_req, res) => res.json({ threads: Object.values(threads) }));

/**
 * POST /ingest
 * Receives a normalised AEP event from the Event Normalizer.
 * Creates/updates a Thread, then dispatches to the registered handler.
 */
app.post('/ingest', async (req, res) => {
  const event = req.body;
  const { channelType, contactKey, payload, eventId } = event;

  if (!eventId || !channelType || !contactKey) {
    return res.status(400).json({ error: 'Missing required fields: eventId, channelType, contactKey' });
  }

  // 1. Create or find existing Thread
  const thread = getOrCreateThread(contactKey, channelType);
  thread.events.push({ eventId, occurredAt: event.occurredAt, payload });
  thread.latestPayload = payload;

  console.log(`[aep-stub] Ingested event ${eventId} → threadId=${thread.threadId} | severity=${payload.severity}`);

  // 2. Evaluate Engagement Path
  const handlers = getHandlers(channelType);
  if (handlers.length === 0) {
    console.warn(`[aep-stub] No handlers configured for channelType=${channelType}`);
    return res.status(202).json({ threadId: thread.threadId, routed: false });
  }

  console.log(`[aep-stub] Routing thread ${thread.threadId} to handlers: ${handlers.join(', ')}`);

  // 3. Dispatch to first handler (cognigy-triage)
  // Fire-and-forget — do not block the 202 response
  setImmediate(async () => {
    for (const handler of handlers) {
      if (handler === 'cognigy-triage') {
        try {
          await axios.post(TRIAGE_URL, { threadId: thread.threadId, payload }, { timeout: 10000 });
          console.log(`[aep-stub] Dispatched thread ${thread.threadId} to cognigy-triage`);
        } catch (err) {
          console.error(`[aep-stub] Failed to dispatch to ${handler}:`, err.message);
        }
      }
    }
  });

  return res.status(202).json({ threadId: thread.threadId, routed: true, handlers });
});

/**
 * GET /context/:threadId
 * MOCK: real implementation is the AEP Context API.
 * Returns thread history + latest device payload for the Agent Context Panel.
 */
app.get('/context/:threadId', (req, res) => {
  const thread = threads[req.params.threadId];
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  return res.json({
    threadId:       thread.threadId,
    contactKey:     thread.contactKey,
    channelType:    thread.channelType,
    status:         thread.status,
    createdAt:      thread.createdAt,
    engagementPath: thread.engagementPath || [],
    devicePayload:  thread.latestPayload || {},
    handover:       thread.handover,
    eventCount:     thread.events.length,
  });
});

/**
 * POST /handover
 * MOCK: real implementation is the AEP Handover API (POST /dfo/3.0/contacts/{contactId}/handover).
 * Called by cognigy-triage when severity exceeds autonomous-resolution threshold.
 */
app.post('/handover', (req, res) => {
  const { threadId, fromHandler, reason, contextSummary, targetQueue } = req.body;

  if (!threadId) {
    return res.status(400).json({ error: 'threadId is required' });
  }

  const thread = threads[threadId];
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  thread.status = 'escalated';
  thread.handover = {
    handoverId:     uuidv4(),
    threadId,
    fromHandler:    fromHandler || 'cognigy-triage',
    reason,
    contextSummary,
    targetQueue:    targetQueue || 'field-service-escalations',
    handedOverAt:   new Date().toISOString(),
  };

  // Update engagement path log
  thread.engagementPath = thread.engagementPath || [];
  thread.engagementPath.push({
    handler:  fromHandler || 'cognigy-triage',
    action:   'handover',
    outcome:  'escalate',
    reason,
    timestamp: new Date().toISOString(),
  });

  console.log(`[aep-stub] HANDOVER: thread=${threadId} | reason=${reason} | queue=${targetQueue}`);

  return res.json({
    handoverId: thread.handover.handoverId,
    threadId,
    status:     'escalated',
    agentContextUrl: `http://localhost:3004/?threadId=${threadId}`,
  });
});

// PATCH /threads/:threadId/path — lets cognigy-triage log its decisions
app.patch('/threads/:threadId/path', (req, res) => {
  const thread = threads[req.params.threadId];
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  thread.engagementPath = thread.engagementPath || [];
  thread.engagementPath.push(req.body);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[aep-stub] Listening on :${PORT}`);
  console.log(`[aep-stub] MOCK: real implementation = orch-entity-thread + AEP handler-registry`);
});
