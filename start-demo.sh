#!/usr/bin/env bash
# ============================================================
# start-demo.sh — CXone Device Signal Bridge
# One-click startup for Mac / Linux.
# Usage:  chmod +x start-demo.sh && ./start-demo.sh
# Requirements: Node.js 18+ with npm, internet access on first run (npm install).
# ============================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS_FILE="$ROOT/.pids"

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

# ── Cleanup: called by trap on Ctrl-C / EXIT ─────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}[stop] Stopping all services...${NC}"
  if [ -f "$PIDS_FILE" ]; then
    while IFS= read -r PID; do
      if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
      fi
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
  for PORT in 3001 3002 3003 5173; do
    SPID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
    [ -n "$SPID" ] && kill -9 $SPID 2>/dev/null || true
  done
  echo -e "${GREEN}[stop] All services stopped.${NC}"
  echo -e "       Logs preserved in: $ROOT/logs/"
  echo ""
}
trap cleanup INT TERM

echo ""
echo -e "${CYAN} ====================================================="
echo -e "  CXone Device Signal Bridge — Sparkathon 2026"
echo -e "  Starting all services..."
echo -e " =====================================================${NC}"
echo ""

# ── 1. Check / auto-install Node.js ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}[setup] Node.js not found. Attempting auto-install...${NC}"
  INSTALLED=0
  set +e
  if command -v brew &>/dev/null; then
    echo "[setup] Using Homebrew to install Node.js..."
    brew install node && INSTALLED=1
  fi
  if [ "$INSTALLED" -eq 0 ]; then
    NVM_SH="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ -s "$NVM_SH" ]; then
      echo "[setup] Using nvm to install Node.js LTS..."
      # shellcheck source=/dev/null
      source "$NVM_SH"
      nvm install --lts && nvm use --lts && INSTALLED=1
    fi
  fi
  set -e
  # After brew install PATH may need a refresh — check common locations
  if [ "$INSTALLED" -eq 1 ] && ! command -v node &>/dev/null; then
    for BPATH in /opt/homebrew/bin /usr/local/bin; do
      [ -f "$BPATH/node" ] && export PATH="$BPATH:$PATH" && break
    done
  fi
  if ! command -v node &>/dev/null; then
    if [ "$INSTALLED" -eq 1 ]; then
      echo -e "${YELLOW}[setup] Node.js installed but not yet in PATH.${NC}"
      echo -e "         Close this terminal and re-run:  ./start-demo.sh"
    else
      echo -e "${RED}[ERROR] Could not auto-install Node.js.${NC}"
      echo -e "         Please install Node.js 18+ from: https://nodejs.org/en/download"
    fi
    exit 1
  fi
fi

NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\)\..*/\1/')
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo -e "${RED}[ERROR] Node.js $NODE_VER found but v18+ is required. Please upgrade.${NC}"
  exit 1
fi
echo -e "${GREEN}[check] Node.js ${NODE_VER} found. Good.${NC}"

# ── 2. Install dependencies (only if node_modules absent) ────────────────────
echo ""
echo "[install] Checking service dependencies..."

for SVC in event-normalizer aep-stub cognigy-triage; do
  DIR="$ROOT/services/$SVC"
  if [ ! -d "$DIR/node_modules" ]; then
    echo -e "${YELLOW}[install] $SVC: running npm install...${NC}"
    (cd "$DIR" && npm install --registry https://registry.npmjs.org --silent)
    echo "[install] $SVC done."
  else
    echo "[install] $SVC: node_modules present, skipping."
  fi
done

# ── 3. Kill any stale processes on ports 3001-3003 / 5173 ────────────────────
echo ""
echo "[clean] Clearing ports 3001/3002/3003/5173..."
for PORT in 3001 3002 3003 5173; do
  # Works on macOS and Linux
  PID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    echo "[clean] Killed stale process on :$PORT (PID $PID)"
  fi
done
sleep 0.5

# ── 4. Start services in background, tee output to log files ─────────────────
echo ""
echo "[start] Launching services in background..."

mkdir -p "$ROOT/logs"
> "$PIDS_FILE"   # reset PID file

start_service() {
  local NAME="$1"
  local DIR="$2"
  local LOG="$ROOT/logs/$NAME.log"
  : > "$LOG"
  (cd "$DIR" && node src/index.js > "$LOG" 2>&1) &
  echo $! >> "$PIDS_FILE"
  echo -e "${GREEN}[start] $NAME started (PID $!, log: logs/$NAME.log)${NC}"
}

# Start in dependency order: triage first, then aep, then normalizer
start_service "cognigy-triage"   "$ROOT/services/cognigy-triage"
sleep 0.3
start_service "aep-stub"         "$ROOT/services/aep-stub"
sleep 0.3
start_service "event-normalizer" "$ROOT/services/event-normalizer"

# ── 5. Health-check loop ──────────────────────────────────────────────────────
echo ""
echo "[wait] Waiting for services to be healthy (up to 30 s each)..."

wait_for_port() {
  local PORT="$1"
  local LABEL="$2"
  local MAX="${3:-30}"
  local ELAPSED=0
  while [ $ELAPSED -lt $MAX ]; do
    if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
      echo -e "${GREEN}[ready] $LABEL :$PORT is UP  (${ELAPSED}s)${NC}"
      return 0
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done
  echo -e "${YELLOW}[WARN]  $LABEL :$PORT did not respond after ${MAX}s. Check logs/$LABEL.log${NC}"
  return 0   # don't abort — user may want to debug
}

wait_for_port 3003 "cognigy-triage  " 30
wait_for_port 3002 "aep-stub        " 30
wait_for_port 3001 "event-normalizer" 30

# ── 6. Start web UI static server ────────────────────────────────────────────
echo ""
echo "[ui] Starting web UI on port 5173 via npx serve..."
(cd "$ROOT" && npx serve web-ui -p 5173 --no-clipboard > "$ROOT/logs/web-ui.log" 2>&1) &
echo $! >> "$PIDS_FILE"
sleep 2

wait_for_port 5173 "web-ui          " 20

# ── 7. Open browser ──────────────────────────────────────────────────────────
echo ""
echo "[browser] Opening http://localhost:5173/demo.html ..."
if command -v open &>/dev/null; then
  open "http://localhost:5173/demo.html"       # macOS
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:5173/demo.html"   # Linux
else
  echo "[browser] Could not auto-open. Paste this URL: http://localhost:5173/demo.html"
fi

# ── 8. Final banner ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN} ====================================================="
echo -e "  All services are UP!"
echo -e " ====================================================="
echo -e "  Event Normalizer  :  http://localhost:3001/health"
echo -e "  AEP Stub          :  http://localhost:3002/health"
echo -e "  Cognigy Triage    :  http://localhost:3003/health"
echo -e "  Demo UI           :  http://localhost:5173/demo.html"
echo -e " ─────────────────────────────────────────────────────"
echo -e "  Logs (tail -f to follow):"
echo -e "    logs/cognigy-triage.log"
echo -e "    logs/aep-stub.log"
echo -e "    logs/event-normalizer.log"
echo -e "    logs/web-ui.log"
echo -e " ─────────────────────────────────────────────────────"
echo -e "  To STOP from another terminal:  ./stop-demo.sh"
echo -e "  OR press Ctrl+C here to stop all services."
echo -e " =====================================================${NC}"
echo ""
echo -e "${CYAN} Press Ctrl+C to stop all services...${NC}"

# Keep this shell alive; the trap fires on Ctrl-C and cleans everything up
wait
