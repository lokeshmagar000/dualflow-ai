# DualFlow AI

Bilingual (Nepali + English) AI video generation and social media automation.
One topic in, two videos out, each posted to its own channels.

## What is here (Phase 0: Foundations)

```
apps/web       Next.js dashboard (login, overview, ideas, content, ...)
apps/api       Fastify API: topics, stories, costs, kill switch
apps/worker    BullMQ workers: the pipeline steps (placeholders until Phase 1)
packages/db    Prisma schema: Story -> Variant (ne, en) and all other tables
packages/shared  Shared types, job names and validation
```

How a video moves through the system:

1. You add an idea in **Ideas & Chat** and click **Make NE + EN video**.
2. The API creates a **Story** with two **Variants** (Nepali and English) and queues a `research` job.
3. The worker runs `research`, then `script → voice → thumbnail → render` for **both languages in parallel**.
4. When both variants are ready, the Story is ready. (Phase 1 adds the real AI work.)

## Run it on your computer

You need Node.js 22, pnpm and Docker.

```bash
pnpm install                 # install all packages
docker compose up -d         # start Postgres and Redis
cp .env.example .env         # then fill in the values (see comments in the file)
cp .env packages/db/.env     # Prisma reads the database URL from here
pnpm db:migrate              # create the database tables
pnpm db:seed                 # add a starter workspace and idea
pnpm dev                     # start web (port 3000), api (4000) and worker
```

Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## Security notes

- The dashboard uses a signed, HTTP-only session cookie.
- The API only accepts requests with the secret `INTERNAL_API_KEY`.
- Never commit `.env`. Social media tokens will be stored encrypted (Phase 2).
