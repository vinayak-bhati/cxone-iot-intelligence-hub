# Demo Script — CXone Device Signal Bridge

*A judge-facing walkthrough. The UI tells the story on its own — use this as a safety net.*

---

## Setup (30 seconds before presenting)

- Run `start-demo.bat` (Windows) or `./start-demo.sh` (Mac/Linux).
- Wait for four service windows to open and the browser to load `http://localhost:5173/demo.html`.
- Leave all service windows visible so judges can see live logs during the demo.

---

## Walkthrough

**1. Browser opens to the prototype page.**  
The hero section states the idea in one line: *"devices report their own faults, NICE's existing AI resolves them before the customer calls."* The three stat badges — `~85% existing platform`, `1 new service`, `<30s to resolution` — are the single most important facts to leave in judges' memory.

**2. Point to the 5-step flow diagram (10 seconds).**  
Read the steps aloud: device → Event Normalizer *(the one new thing, gold badge)* → AEP + Cognigy *(existing, teal badge)* → auto-resolve or escalate → customer. The color-coded NEW / EXISTING / EXTEND badges match the pitch deck legend.

**3. Click "Fire Scheduled Maintenance" — watch the happy path.**  
- Each step box lights up in teal as the backend processes the event.
- The live timeline streams events: normalizer accepts, AEP creates a thread, Cognigy applies rules.
- Result: a green **Customer SMS card** appears — the customer is notified their annual service has been automatically booked, without ever making a phone call.
- Expected time: under 30 seconds.

**4. Click "Fire Critical Fault" — watch the escalation + resolution path.**  
- The step boxes light up in red, signaling the critical path.
- Cognigy's reasoning appears in the timeline: *"CRITICAL severity with ACTIVE warranty — escalating to field-service agent. Agent will review device context, confirm warranty coverage, book a repair technician, and notify the customer."*
- Result: a red **Agent Context Panel card** appears — device ID (`AC-00888`), fault code (`E99-COMPRESSOR-FAIL`), warranty status (ACTIVE), and the AI's full reasoning are pre-loaded for the agent.
- Because warranty is ACTIVE, the card also shows the **Agent Action** outcome: repair technician booked, plus a **Customer SMS** notification confirming the appointment.
- Expected time: under 30 seconds.

**5. (Optional) Click "View Full Architecture Diagram"** in the footer to open the detailed architecture for any judges who want to go deeper.

---

## Key talking points

- The Event Normalizer is ~140 lines of Node.js. That's all that's new.
- AEP's Thread + Engagement Path system already handles routing today — we just added a new `channelType: iot-device`.
- Cognigy's triage rules map 1:1 to a real Cognigy Flow with HTTP Request nodes — no AI magic, just warranty + severity policy rules.
- Switching from the mock services to real AEP and Cognigy production endpoints requires a single config change — no code edits.
