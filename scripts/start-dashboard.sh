#!/bin/sh
# Starts the dashboard on Render (render.yaml -> dualflow-web -> startCommand).
#
# FASTER "ONE SERVER" MODE (docs/faster-dashboard.md):
#   When this server has DATABASE_URL, the API also runs here, inside the same
#   free server. Then:
#     - only ONE server has to wake up after a break (before: two, one after the other),
#     - every page asks the API on this same machine (http://127.0.0.1) instead of
#       going out over the internet to the other Render server,
#     - one server awake all month fits Render's 750 free hours.
#   Without DATABASE_URL nothing changes: the dashboard uses the separate API (API_URL).

if [ -n "$DATABASE_URL" ]; then
  echo "One server mode: starting the API inside the dashboard server."
  export API_URL="http://127.0.0.1:4001"
  # Run the API in the background (&). If it ever stops, start it again after 3 seconds.
  (
    cd apps/api || exit 1
    while true; do
      # "node --import tsx" runs the TypeScript directly with one process (saves memory),
      # and max-old-space-size keeps the API small so both fit in the free 512 MB.
      API_PORT=4001 node --import tsx --max-old-space-size=160 src/index.ts
      echo "The API stopped. Starting it again in 3 seconds..."
      sleep 3
    done
  ) &
fi

# The dashboard itself. "exec" lets it take over this script, so Render can stop it cleanly.
cd apps/web && NODE_OPTIONS="--max-old-space-size=220" exec ./node_modules/.bin/next start
