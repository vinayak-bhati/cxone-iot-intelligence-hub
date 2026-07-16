#!/usr/bin/env node
/**
 * Demo Harness — CXone Device Signal Bridge
 *
 * Usage:
 *   node fire-event.js low     — fires the LOW-severity air conditioner scheduled maintenance event (auto-resolve expected)
 *   node fire-event.js high    — fires the CRITICAL-severity fault (escalate expected)
 *   node fire-event.js usage   — prints the usage counter from the event-normalizer
 *   node fire-event.js threads — lists all threads from aep-stub
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const NORMALIZER_URL = process.env.NORMALIZER_URL || 'http://localhost:3001';
const AEP_URL        = process.env.AEP_URL        || 'http://localhost:3002';

const PAYLOADS = {
  low:  path.join(__dirname, 'sample-payloads', 'washing-machine-motor-fault-medium.json'),
  high: path.join(__dirname, 'sample-payloads', 'washing-machine-critical-fault.json'),
};

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port:     urlObj.port || 80,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = { hostname: urlObj.hostname, port: urlObj.port || 80, path: urlObj.pathname };
    http.get(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const cmd = process.argv[2] || 'low';

  if (cmd === 'usage') {
    console.log('\n📊 Usage Counter Dashboard');
    console.log('─────────────────────────');
    const data = await get(`${NORMALIZER_URL}/usage`);
    if (Object.keys(data.counters || {}).length === 0) {
      console.log('No events processed yet.');
    } else {
      Object.entries(data.counters).forEach(([cid, count]) => {
        console.log(`  ${cid.padEnd(20)} : ${count} billable event(s)`);
      });
    }
    return;
  }

  if (cmd === 'threads') {
    console.log('\n🧵 Active Threads (AEP Stub)');
    console.log('──────────────────────────────');
    const data = await get(`${AEP_URL}/threads`);
    (data.threads || []).forEach(t => {
      console.log(`  ${t.threadId} | ${t.contactKey} | status=${t.status} | events=${t.events.length}`);
    });
    return;
  }

  const payloadFile = PAYLOADS[cmd];
  if (!payloadFile) {
    console.error(`Unknown command: ${cmd}. Use: low | high | usage | threads`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
  delete payload._comment;

  console.log(`\n🔥 Firing ${cmd.toUpperCase()} severity fault event`);
  console.log('─────────────────────────────────────────────────');
  console.log(`  Device:   ${payload.deviceId} (${payload.assetType})`);
  console.log(`  Fault:    ${payload.faultCode} | severity=${payload.severity}`);
  console.log(`  Customer: ${payload.customerId} | warranty=${payload.warrantyStatus}`);
  console.log(`  Source:   ${payload.sourceAgent}`);
  console.log('\n  → POST /events to Event Normalizer…');

  try {
    const result = await post(`${NORMALIZER_URL}/events`, payload);
    if (result.status === 202) {
      console.log(`  ✓ Accepted | eventId=${result.body.eventId}`);
      console.log(`  ✓ contactKey=${result.body.contactKey}`);
      console.log(`  ✓ Usage count [${payload.customerId}] = ${result.body.usageCount}`);
      console.log('\n  Watch the service logs for the triage decision…');
      if (cmd === 'high') {
        console.log('\n  🚨 CRITICAL fault — expect escalation!');
        console.log(`  📺 Open the Agent Context Panel: http://localhost:3004/`);
      } else {
        console.log('\n  ✅ MEDIUM fault — expect auto-resolve!');
      }
    } else {
      console.error(`  ✗ HTTP ${result.status}:`, result.body);
    }
  } catch (err) {
    console.error('  ✗ Failed to connect to Event Normalizer:', err.message);
    console.error('  Is the stack running? Try: docker compose up');
  }
}

main().catch(console.error);
