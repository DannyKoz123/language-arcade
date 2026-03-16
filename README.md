# Language Arcade

Backend-first language guessing game built as an `npm` workspace monorepo with:

- `apps/api`: Fastify API, PostgreSQL persistence, guest sessions, server-authoritative game logic
- `apps/web`: Next.js client for gameplay, profile, and leaderboards
- `packages/shared`: shared domain types, scoring, and round-selection engine

## Quick start

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d`.
3. Install dependencies:
   - PowerShell on Windows: `npm.cmd install`
   - Shells that allow `npm` directly: `npm install`
4. Generate the synthetic demo audio: `npm.cmd run audio:generate`
5. Apply migrations: `npm.cmd run db:migrate`
6. Seed demo content: `npm.cmd run db:seed`
7. Start the API and web app together: `npm.cmd run dev`

The repo ships with demo content and synthetic audio so the full stack can run locally without downloading FLEURS.

## Local URLs

- Web app: `http://localhost:3000`
- API health check: `http://localhost:3001/health`
- Demo audio assets: `http://localhost:3001/audio/...`

## What is improved in this pass

- Active runs now resume instead of silently creating duplicates, and the web client restores the active round after refresh.
- Round answers and hint mutations are transaction-backed, so stale submissions are rejected cleanly instead of leaving the run in an inconsistent state.
- API errors now return structured status/code responses, and route params are validated with Zod.
- The play screen now shows run progress, hint state, score breakdowns, and clearer recovery messaging when server state changes.

## Verification

- Production build: `npm.cmd run build`
- Test suite: `npm.cmd run test`

## Notes

- If PowerShell blocks `npm` scripts with an execution policy error, use `npm.cmd` as shown above.
- Publishing a content version now activates that version's languages and deactivates clips from older versions, while individual clip disables remain respected.
