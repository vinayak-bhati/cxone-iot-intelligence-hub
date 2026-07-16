/**
 * Cognigy Triage Mock Service — CXone Device Signal Bridge
 *
 * MOCK: Replicates the decision logic of a real Cognigy IoT Triage Flow.
 *
 * In Path A (real Cognigy), this logic lives in a Cognigy Flow with:
 *   - HTTP Request node → GET /context (AEP Context API)
 *   - Condition node  → warranty check + severity routing
 *   - HTTP Request node → POST /handover (AEP Handover API) if escalating
 *
 * Triage rules (from the product brief):
 *   1. warrantyStatus != ACTIVE      → escalate (reason: no_warranty)
 *   2. severity LOW or MEDIUM        → auto-resolve (book technician, notify customer)
 *   3. severity HIGH or CRITICAL     → escalate (reason: severity_outside_policy)
 *
 * SSE endpoint /events streams all triage decisions to the Agent Context Panel in real time.
 */

'use strict';

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const configDir = path.join(__dirname, '..', 'config');
const configFile = fs.existsSync(path.join(configDir, 'env.local.json'))
  ? path.join(configDir, 'env.local.json')
  : path.join(configDir, 'env.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
console.log(`[cognigy-triage] Using config: ${configFile}`);

const PORT       = config.COGNIGY_TRIAGE_PORT || 3003;
const AEP_BASE   = config.AEP_STUB_URL        || 'http://aep-stub:3002';

// ─── SSE clients (for Agent Context Panel live update) ───────────────────────
const sseClients = [];

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => {
    try { client.res.write(data); } catch (_) { /* ignore disconnected clients */ }
  });
}

// ─── Triage logic ─────────────────────────────────────────────────────────────
/**
 * Pure decision function — mirrors the Condition node logic in Cognigy Flow Studio.
 * Returns { decision, reason, action }
 */
function decide(payload) {
  const { warrantyStatus, severity } = payload;

  if (warrantyStatus && warrantyStatus !== 'ACTIVE') {
    return {
      decision: 'escalate',
      reason:   'no_warranty',
      reasoning: `Warranty status is ${warrantyStatus}. Cannot auto-resolve without active warranty — escalating to field-service agent.`,
    };
  }
  if (severity === 'HIGH' || severity === 'CRITICAL') {
    return {
      decision: 'escalate',
      reason:   'severity_outside_policy',
      reasoning: `Severity ${severity} with ${warrantyStatus} warranty — escalating to field-service agent. Agent will review device context, confirm warranty coverage, book a repair technician, and notify the customer.`,
    };
  }
  // LOW or MEDIUM + warranty active → auto-resolve
  return {
    decision: 'auto_resolve',
    reason:   'within_autonomous_policy',
    reasoning: `Severity ${severity} with ${warrantyStatus} warranty — auto-resolving: booking technician and notifying customer.`,
  };
}

async function autoResolve(threadId, payload, triageResult) {
  console.log(`[cognigy-triage] AUTO-RESOLVE: thread=${threadId} | ${triageResult.reasoning}`);

  // Log the decision back to AEP stub for context tracking
  try {
    await axios.patch(`${AEP_BASE}/threads/${threadId}/path`, {
      handler:   'cognigy-triage',
      action:    'auto_resolve',
      outcome:   'resolved',
      reasoning: triageResult.reasoning,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[cognigy-triage] Could not patch AEP thread path:', err.message);
  }

  // Simulate downstream actions (booking + notification)
  await sleep(400);
  console.log(`[cognigy-triage] ✓ Technician booked for device=${payload.deviceId}`);
  await sleep(200);
  console.log(`[cognigy-triage] ✓ Customer ${payload.customerId} notified via preferred channel`);

  broadcast({ type: 'auto_resolve', threadId, payload, ...triageResult, resolvedAt: new Date().toISOString() });
}

async function escalate(threadId, payload, triageResult) {
  console.log(`[cognigy-triage] ESCALATE: thread=${threadId} | ${triageResult.reasoning}`);

  // Fetch context from AEP for the handover summary
  let context = {};
  try {
    const ctxResp = await axios.get(`${AEP_BASE}/context/${threadId}`, { timeout: 3000 });
    context = ctxResp.data;
  } catch (err) {
    console.warn('[cognigy-triage] Could not fetch context from AEP:', err.message);
  }

  // POST /handover to AEP
  try {
    const handoverResp = await axios.post(`${AEP_BASE}/handover`, {
      threadId,
      fromHandler:    'cognigy-triage',
      reason:          triageResult.reason,
      contextSummary:  `${triageResult.reasoning} | device=${payload.deviceId} faultCode=${payload.faultCode} warranty=${payload.warrantyStatus}`,
      targetQueue:    'field-service-escalations',
    }, { timeout: 5000 });

    console.log(`[cognigy-triage] ✓ Handover submitted: handoverId=${handoverResp.data.handoverId}`);
    console.log(`[cognigy-triage] ✓ Agent Context Panel URL: ${handoverResp.data.agentContextUrl}`);

    broadcast({
      type:       'escalate',
      threadId,
      payload,
      context,
      handoverId: handoverResp.data.handoverId,
      agentContextUrl: handoverResp.data.agentContextUrl,
      ...triageResult,
      escalatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cognigy-triage] Handover failed:', err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'cognigy-triage' }));

/**
 * POST /triage
 * Called by aep-stub when an iot-device event arrives.
 * Applies triage rules and either auto-resolves or escalates.
 */
app.post('/triage', async (req, res) => {
  const { threadId, payload } = req.body;

  if (!threadId || !payload) {
    return res.status(400).json({ error: 'threadId and payload are required' });
  }

  console.log(`[cognigy-triage] Received triage request: thread=${threadId} | severity=${payload.severity} | warranty=${payload.warrantyStatus}`);

  const triageResult = decide(payload);
  console.log(`[cognigy-triage] Decision: ${triageResult.decision} | reason: ${triageResult.reason}`);

  // Acknowledge immediately; run triage asynchronously
  res.status(202).json({ threadId, decision: triageResult.decision, reason: triageResult.reason });

  // Execute the decision
  if (triageResult.decision === 'auto_resolve') {
    await autoResolve(threadId, payload, triageResult);
  } else {
    await escalate(threadId, payload, triageResult);
  }
});

/**
 * GET /events
 * Server-Sent Events stream for the Agent Context Panel to receive live triage updates.
 */
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');

  const client = { id: Date.now(), res };
  sseClients.push(client);
  console.log(`[cognigy-triage] SSE client connected (total: ${sseClients.length})`);

  req.on('close', () => {
    const idx = sseClients.indexOf(client);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`[cognigy-triage] SSE client disconnected (total: ${sseClients.length})`);
  });
});

app.listen(PORT, () => {
  console.log(`[cognigy-triage] Listening on :${PORT}`);
  console.log(`[cognigy-triage] MOCK: real implementation = Cognigy Flow Studio (IoT Triage Flow)`);
  console.log(`[cognigy-triage] AEP base URL: ${AEP_BASE}`);
});
