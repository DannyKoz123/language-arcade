# Language Arcade

Backend-first language guessing game built as an `npm` workspace monorepo with:

- `apps/api`: Fastify API, PostgreSQL persistence, guest sessions, server-authoritative game logic
- `apps/web`: Next.js client for gameplay, profile, and leaderboards
- `packages/shared`: shared domain types, scoring, and round-selection engine

## Quick start

1. Copy `.env.example` to `.env`.
2. Start Postgres with `docker compose up -d`.
3. Install dependencies with `npm.cmd install`.
4. Generate demo audio with `npm run audio:generate`.
5. Run migrations with `npm run db:migrate`.
6. Seed demo content with `npm run db:seed`.
7. Start the apps with `npm run dev`.

The repo ships with demo content and synthetic audio so the full stack can run locally without downloading FLEURS.
