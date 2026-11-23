#!/bin/sh
# Vercel runs this to build the dashboard (see apps/web/vercel.json).
# 1. Make the database code (Prisma).
# 2. Bring the database up to date, only for the real (production) site.
#    Test versions of a branch ("previews") never change your database.
# 3. Build the dashboard.
set -e
cd "$(dirname "$0")/.."
pnpm db:generate
if [ "$VERCEL_ENV" = "production" ] && [ -n "$DATABASE_URL" ]; then
  echo "Updating the database (prisma migrate deploy)..."
  pnpm --filter @dualflow/db run deploy
else
  echo "Skipping the database update (not the production site, or no DATABASE_URL)."
fi
pnpm --filter @dualflow/web build
