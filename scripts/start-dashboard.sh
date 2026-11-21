#!/bin/sh
# Starts the dashboard on Render (render.yaml -> dualflow-web -> startCommand).
#
# ONE SERVER MODE (docs/fix-dashboard-connection.md):
#   When this server has DATABASE_URL, the dashboard starts the API by itself
#   (apps/web/src/lib/inside-api.ts, run from apps/web/src/instrumentation.ts),
#   so it also works if Render still uses the old start command
#   "pnpm --filter @dualflow/web start". This script only starts the dashboard.

# "exec" lets the dashboard take over this script, so Render can stop it cleanly.
# max-old-space-size keeps memory small so the dashboard and the API fit in the free 512 MB.
cd apps/web && NODE_OPTIONS="--max-old-space-size=220" exec ./node_modules/.bin/next start
