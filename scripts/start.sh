#!/usr/bin/env bash
# Start CardioLens locally with one command (macOS, Linux, Git Bash).
# First run: creates the Python environment and builds the dashboard.
# Usage: scripts/start.sh   |   PORT=8080 scripts/start.sh   |   REBUILD=1 scripts/start.sh   |   NO_BROWSER=1 scripts/start.sh
set -euo pipefail

PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://127.0.0.1:${PORT}"

cd "$ROOT/backend"
if [ ! -d .venv ]; then
  echo "Creating the Python environment (first run, a few minutes)..."
  python3 -m venv .venv
  if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=.venv/Scripts/python.exe; fi
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r requirements.txt
fi
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=.venv/Scripts/python.exe; fi

if [ "${REBUILD:-0}" = "1" ] || [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "Building the dashboard..."
  (cd "$ROOT/frontend" && { [ -d node_modules ] || npm ci; } && npm run build)
fi

# Open the browser as soon as the API answers (NO_BROWSER=1 to skip).
if [ "${NO_BROWSER:-0}" != "1" ]; then
  (
    for _ in $(seq 1 90); do
      if curl -fs "$URL/api/health" >/dev/null 2>&1; then
        open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || cmd.exe /c start "" "$URL" 2>/dev/null || true
        break
      fi
      sleep 1
    done
  ) &
fi

echo "CardioLens is starting on $URL  (Ctrl+C to stop)"
exec "$PY" -m uvicorn cardiolens.api.main:app --host 127.0.0.1 --port "$PORT"
