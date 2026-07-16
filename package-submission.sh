#!/usr/bin/env bash
# ============================================================
# package-submission.sh — CXone Device Signal Bridge
# Zips the entire submission folder for upload to Sparkathon site.
# Output: ../cxone-device-signal-bridge-submission.zip (one level up)
#
# NODE_MODULES TRADE-OFF:
#   node_modules are EXCLUDED from the zip (INCLUDE_DEPS=0).
#   The start-demo.sh script runs `npm install` automatically on first run,
#   which requires internet access (npmjs.org).
#   Set INCLUDE_DEPS=1 below to bundle node_modules (~30-50 MB extra) so the
#   zip runs fully offline without any npm install step.
# ============================================================

INCLUDE_DEPS=0

ROOT="$(cd "$(dirname "$0")" && pwd)"
FOLDER_NAME="cxone-device-signal-bridge-submission"
OUTZIP="$(dirname "$ROOT")/${FOLDER_NAME}.zip"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'

echo ""
echo -e "${CYAN}[package] Building submission zip...${NC}"
echo "[package] Source:  $ROOT"
echo "[package] Output:  $OUTZIP"
echo ""

# Remove previous zip
rm -f "$OUTZIP"

# Build exclude list
EXCLUDES=(
  ".git"
  ".logs"
  ".pids"
  "__pycache__"
  "*.pyc"
)

if [ "$INCLUDE_DEPS" = "0" ]; then
  echo "[package] Excluding node_modules (INCLUDE_DEPS=0). Start script installs on first run."
  EXCLUDES+=("node_modules")
else
  echo "[package] INCLUDING node_modules (INCLUDE_DEPS=1). Offline cold start supported."
fi

# Build zip -x patterns
EXCL_ARGS=()
for EX in "${EXCLUDES[@]}"; do
  EXCL_ARGS+=("--exclude=*/${EX}/*" "--exclude=*/${EX}" "--exclude=${EX}/*" "--exclude=${EX}")
done

# Change to parent dir so the zip contains cxone-device-signal-bridge-submission/
(
  cd "$(dirname "$ROOT")"
  zip -r "$OUTZIP" "$FOLDER_NAME" \
    --exclude="*/.git/*" \
    --exclude="*/.git" \
    --exclude="*/.logs/*" \
    --exclude="*/.pids" \
    --exclude="*/node_modules/*" \
    --exclude="*/node_modules" \
    "${EXCL_ARGS[@]}"
)

# Print size
if [ -f "$OUTZIP" ]; then
  SIZE=$(du -sh "$OUTZIP" | cut -f1)
  echo ""
  echo -e "${GREEN}[package] ====================================================="
  echo "[package] Zip created:  $OUTZIP"
  echo "[package] Size:         $SIZE"
  echo -e "[package] =====================================================${NC}"
  echo ""
  echo "  NEXT STEP: Upload this zip (or a shared-drive link to it) to"
  echo "  the Sparkathon site's \"Prototype Instructions and Explanations\""
  echo "  section of your team's idea page."
  echo ""
else
  echo "[package] ERROR: zip was not created. Make sure 'zip' is installed."
  exit 1
fi
