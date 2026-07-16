/**
 * Event Normalizer — CXone Device Signal Bridge
 *
 * Receives raw vendor device-fault events, validates against the inbound schema,
 * maps to the AEP event shape, publishes to the AEP ingestion queue (real Kinesis
 * on Path A, the aep-stub in-memory queue on Path B), and increments a usage counter.
 *
 * MOCK note: Path B is active. Swap AEP_QUEUE_URL in config/env.json to point at
 * the real AEP Kinesis HTTP proxy when switching to Path A — no code change required.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const configDir = path.join(__dirname, '..', 'config');
const configFile = fs.existsSync(path.join(configDir, 'env.local.json'))
  ? path.join(configDir, 'env.local.json')
  : path.join(configDir, 'env.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
console.log(`[event-normalizer] Using config: ${configFile}`);

const PORT = config.EVENT_NORMALIZER_PORT || 3001;
const AEP_QUEUE_URL = config.AEP_QUEUE_URL || 'http://aep-stub:3002/ingest';
const NORMALIZER_VERSION = '1.0.0';

// ─── Schema validation ────────────────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const inboundSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schemas', 'device-fault-event.schema.json'), 'utf8')
);
const validateInbound = ajv.compile(inboundSchema);

// ─── In-memory usage counter ──────────────────────────────────────────────────
// MOCK: real implementation would call the METER API (VoiceBioHub billing pattern)
// per-customerId, keyed by tenantId in DynamoDB.
const usageCounters = {};

function incrementCounter(customerId) {
  usageCounters[customerId] = (usageCounters[customerId] || 0) + 1;
  return usageCounters[customerId];
}

// ─── Normalisation ────────────────────────────────────────────────────────────
function normalise(inbound) {
  return {
    eventId: uuidv4(),
    channelType: 'iot-device',
    contactKey: `${inbound.customerId}:${inbound.deviceId}`,
    occurredAt: new Date().toISOString(),
    payload: {
      deviceId:        inbound.deviceId,
      assetType:       inbound.assetType || 'Unknown',
      faultCode:       inbound.faultCode,
      severity:        inbound.severity,
      customerId:      inbound.customerId,
      warrantyStatus:  inbound.warrantyStatus || 'UNKNOWN',
      vendorDiagnosis: inbound.agentDiagnosis || '',
      sourceAgent:     inbound.sourceAgent || 'unknown',
    },
    meta: {
      normalizerVersion: NORMALIZER_VERSION,
      usageCounterKey:   inbound.customerId,
    },
  };
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// CORS — required so the browser-based demo UI (localhost:5173) can POST here
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'event-normalizer' }));

// Usage counter dashboard (for live demo)
app.get('/usage', (_req, res) => res.json({ counters: usageCounters }));

/**
 * POST /events
 * Accepts a raw vendor device-fault event.
 * Validates → normalises → publishes to AEP queue → increments counter.
 */
app.post('/events', async (req, res) => {
  const raw = req.body;

  // 1. Validate
  const valid = validateInbound(raw);
  if (!valid) {
    console.error('[event-normalizer] Validation failed:', validateInbound.errors);
    return res.status(400).json({ error: 'Validation failed', details: validateInbound.errors });
  }

  // 2. Normalise
  const aepEvent = normalise(raw);
  console.log(`[event-normalizer] Normalised event: ${aepEvent.eventId} | contactKey=${aepEvent.contactKey} | severity=${aepEvent.payload.severity}`);

  // 3. Publish to AEP ingestion queue
  try {
    const response = await axios.post(AEP_QUEUE_URL, aepEvent, { timeout: 5000 });
    console.log(`[event-normalizer] Published to AEP queue → threadId=${response.data.threadId}`);
  } catch (err) {
    console.error('[event-normalizer] Failed to publish to AEP queue:', err.message);
    return res.status(502).json({ error: 'Failed to publish to AEP queue', detail: err.message });
  }

  // 4. Increment usage counter
  const count = incrementCounter(raw.customerId);
  console.log(`[event-normalizer] Usage counter [${raw.customerId}] = ${count}`);

  return res.status(202).json({
    eventId: aepEvent.eventId,
    contactKey: aepEvent.contactKey,
    usageCount: count,
    message: 'Event accepted and published to AEP ingestion queue',
  });
});

app.listen(PORT, () => {
  console.log(`[event-normalizer] Listening on :${PORT}`);
  console.log(`[event-normalizer] AEP queue endpoint: ${AEP_QUEUE_URL}`);
});
