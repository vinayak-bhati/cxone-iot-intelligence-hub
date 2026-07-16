#!/usr/bin/env bash
# ============================================================
# stop-demo.sh — CXone Device Signal Bridge
# Stops all demo service background processes.
# Usage:  ./stop-demo.sh
# ============================================================

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS_FILE="$ROOT/.pids"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN}[stop] Stopping all CXone Device Signal Bridge demo services...${NC}"
echo ""

KILLED=0

# Kill PIDs recorded by start-demo.sh
if [ -f "$PIDS_FILE" ]; then
  while IFS= read -r PID; do
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo -e "${GREEN}[stop] Killed PID $PID${NC}"
      KILLED=$((KILLED + 1))
    fi
  done < "$PIDS_FILE"
  rm -f "$PIDS_FILE"
fi

# Belt-and-suspenders: also kill anything still on the known ports
for PORT in 3001 3002 3003 5173; do
  PID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    echo -e "${GREEN}[stop] Killed stale process on :$PORT (PID $PID)${NC}"
    KILLED=$((KILLED + 1))
  fi
done

sleep 0.5

if [ "$KILLED" -eq 0 ]; then
  echo -e "${YELLOW}[stop] No demo processes found.${NC}"
else
  echo ""
  echo -e "${GREEN}[stop] Stopped $KILLED process(es).${NC}"
fi

echo ""
echo -e "${GREEN}All demo services stopped. Ports 3001/3002/3003/5173 are free.${NC}"
echo -e "Logs are preserved in the logs/ folder."
echo -e "Delete logs/ manually if you want a clean slate."
echo ""
