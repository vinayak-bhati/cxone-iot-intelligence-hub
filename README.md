# CXone Device Signal Bridge — Sparkathon 2026

> **Devices report their own faults; NICE's existing AI resolves them before the customer calls.**

---

## What this prototype demonstrates

- **A device fault (air conditioner, HVAC, any IoT device) fires itself directly into NICE CXone** — no customer phone call required.
- **The Event Normalizer** (the one new service in this submission) validates the vendor payload and maps it to the standard NICE AEP event schema.
- **NICE AEP + Cognigy** (both already shipping in CXone today) receive the event, apply warranty + severity rules, and either auto-resolve the case or escalate to a human agent with full device context pre-loaded.
- **The judge-facing UI** shows the entire 5-step flow lighting up live as the backend processes the event — from device fault to customer SMS or Agent Context Panel, in under 30 seconds.

The prototype reuses **~85% existing NICE platform** and adds exactly **1 new service** (Event Normalizer, ~140 lines of Node.js).

---

## How to run it

### Prerequisites

| Requirement | Version | Why |
|---|---|---|
| **Node.js** | 18 or newer | Runs all three backend services and the web-UI static server |
| **npm** | bundled with Node.js | Installs service dependencies on first run |
| **Internet access** | Required on first run only | `npm install` fetches packages from npmjs.org; subsequent runs work offline |

Download Node.js from [https://nodejs.org](https://nodejs.org) — the LTS installer bundles npm.

---

### Windows — double-click to start

1. Unzip the submission folder anywhere on your machine.
2. **Double-click `start-demo.bat`** (or right-click → Run as Administrator if you see a permissions error).
3. Four command-prompt windows will open — one per service plus the web UI. Leave them running.
4. The script polls each service's `/health` endpoint and opens your default browser automatically to **`http://localhost:5173/demo.html`** once everything is ready.
5. If the browser does not open automatically, paste this URL manually: **`http://localhost:5173/demo.html`**

**To stop:** double-click `stop-demo.bat` — it kills all processes on ports 3001/3002/3003/5173.

---

### Mac / Linux — shell script

1. Unzip the submission folder anywhere.
2. Open a terminal in the unzipped folder.
3. Make the script executable (once only):
   ```bash
   chmod +x start-demo.sh stop-demo.sh
   ```
4. Run:
   ```bash
   ./start-demo.sh
   ```
5. The script installs dependencies, starts services, and opens your browser to **`http://localhost:5173/demo.html`** automatically.
6. If the browser does not open, paste: **`http://localhost:5173/demo.html`**

**To stop:**
```bash
./stop-demo.sh
```

---

### What should happen after startup

- **Four windows open** (Windows) or four background processes start (Mac/Linux):
  - `cognigy-triage` on port **3003** — prints `[cognigy-triage] Listening on :3003`
  - `aep-stub` on port **3002** — prints `[aep-stub] Listening on :3002`
  - `event-normalizer` on port **3001** — prints `[event-normalizer] Listening on :3001`
  - `web-ui` (npx serve) on port **5173**
- The browser opens to the demo page showing the hero section and two demo buttons.
- The first `npm install` may take 30–60 seconds depending on your internet speed. Subsequent runs skip this step entirely.

---

## How to test the demo

The demo page has two large buttons. Each takes under 30 seconds.

### 🟢 Fire Scheduled Maintenance
- Fires a **LOW-severity** scheduled maintenance event (device `AC-00421`, warranty ACTIVE).
- **What you should see:** The 5-step flow diagram lights up step by step. Cognigy decides: LOW + active warranty → auto-resolve. A mock customer SMS appears (green result card) showing the maintenance booking message the customer would receive.
- **Proves:** the happy-path — proactive scheduled service booked autonomously, customer never needs to call.

### 🔴 Fire Critical Fault
- Fires a **CRITICAL-severity** compressor failure (device `AC-00888`, warranty ACTIVE).
- **What you should see:** The flow diagram lights up in red. Cognigy decides: CRITICAL severity → escalate to agent. An Agent Context Panel card appears showing device ID, fault code, warranty status, and Cognigy's reasoning. Because warranty is ACTIVE, the agent confirms and books a repair technician — a customer SMS notification appears showing the appointment details.
- **Proves:** the escalation path — agent has full device context before acting, warranty-backed repair booked without the customer needing to call.

You can run both scenarios back-to-back. Each run resets the timeline automatically.

---

## Architecture at a glance

![CXone Device Signal Bridge Architecture](https://www.plantuml.com/plantuml/svg/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80)

*(Architecture source: `docs/architecture.puml`)*

**The one new thing:** `event-normalizer` — a ~140-line Node.js service that validates vendor device-fault payloads, maps them to the AEP standard schema, and publishes to AEP's ingest queue. Everything else — AEP, Cognigy, the Agent Workspace — already exists in the NICE CXone platform.

```
Vendor device / field-service agent
        │
        ▼  POST /events (vendor schema)
┌─────────────────────────┐
│   Event Normalizer       │  ← THE ONE NEW SERVICE
│   Validates + normalises │
└────────────┬────────────┘
             │  POST /ingest (AEP schema)
             ▼
┌─────────────────────────┐
│   NICE AEP (stub)        │  ← Existing (orch-entity-thread)
│   Creates Thread         │
│   Evaluates Engagement   │
│   Path → cognigy-triage  │
└────────────┬────────────┘
             │  POST /triage
             ▼
┌─────────────────────────┐
│   Cognigy IoT Triage     │  ← Existing (Cognigy Flow Studio)
│   Warranty + severity    │
│   rules engine           │
└────────┬────────┬───────┘
         │        │
   auto-resolve  escalate
         │        │
         ▼        ▼
   Customer     Agent Workspace
   SMS sent     (CXone screen-pop)
```

---

## Repository

This prototype is distributed as a self-contained zip file. No external repository link is required for this submission — the zip contains all source code needed to run the demo cold.

Upload the zip file (or a shared-drive link to it) to the **"Prototype Instructions and Explanations"** field on your team's Sparkathon idea page.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Node.js not found"** on startup | Install Node.js 18+ from [https://nodejs.org](https://nodejs.org) and re-run the script. |
| **Port already in use** (EADDRINUSE :3001/3002/3003/5173) | Run `stop-demo.bat` (Windows) or `./stop-demo.sh` (Mac/Linux) first, then restart. |
| **Browser didn't open automatically** | Paste `http://localhost:5173/demo.html` into your browser manually. |
| **Timeline shows "Cannot reach Event Normalizer"** | The services haven't finished starting yet — wait 10 seconds and try again. Check the service windows for errors. |
| **`npm install` takes a long time** | First-run only; subsequent runs skip it. If it hangs, check your internet connection. |
| **`npx serve` hangs or shows an error** | `npx` downloads the `serve` package on first use; this requires internet. Run `npx serve web-ui -p 5173` manually in the submission folder, then open `http://localhost:5173/demo.html`. |

---

## Team / Submission owner

**Team:** Brij and Vinayak

This submission is owned end-to-end by the team as a Sparkathon 2026 entry.  
**Submission deadline:** Thursday, July 16, 2026, 11:59 PM local time.
