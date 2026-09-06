# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Garage management & billing web app for Babu Awamir Auto Garage (Qatar), built as a Next.js App Router app deployed to Vercel. Full requirements are in `docs/prd.md`; the original setup walkthrough is in `docs/setup.md` (predates the Postgres/Vercel migration — useful for *why* things were originally wired the way they were, but the checked-in code is the source of truth for *how* things work now).

## Commands

```bash
npm run dev     # Next.js dev server (http://localhost:3000)
npm run build   # next build
npm run start   # next start (production server)
npm run lint    # eslint
```

There is no test runner configured yet (no jest/vitest in `package.json`).

## Architecture

- **Next.js is both frontend and backend.** UI lives in `src/app/**/page.tsx`; business logic and DB access live in Route Handlers under `src/app/api/**/route.ts`. Deployed to Vercel as a standard Next.js app — no desktop shell, no Electron.
- **Database** (`src/lib/db.ts`): a `pg` connection pool against `DATABASE_URL` (PostgreSQL — Neon in production). Schema is bootstrapped with `CREATE TABLE IF NOT EXISTS` on first query per cold start — there is no separate migration system, so schema changes are made by editing the bootstrap SQL block directly. This module is **server-only** — never import it from a Client Component, only from Route Handlers or Server Components.
  - `db.prepare(sql).get/.all/.run(...)` keeps a SQLite-like call shape for convenience: `?` placeholders are converted to `$1,$2,...` automatically. `.run()` only returns `lastInsertRowid` if the SQL explicitly ends in `RETURNING id`.
  - `db.transaction(fn)` runs `fn` (must be `async`) on a single dedicated client via `AsyncLocalStorage`, so nested `db.prepare(...)` calls inside it transparently share that transaction — call it as `await db.transaction(async () => { ... })()`.
  - id columns are `INTEGER` (not `BIGINT`) and money columns are `DOUBLE PRECISION` (not `NUMERIC`) deliberately — `pg` returns `BIGINT`/`NUMERIC` as JS strings, not numbers, which would silently break arithmetic and JSON responses throughout the app.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`).
- Current schema (in `src/lib/db.ts`) covers `users`, `sessions`, `customers`, `vehicles`, `predefined_services`, `invoices`, `invoice_items`, `expense_categories`, `expenses`, `audit_logs`, `settings` — cross-reference against `docs/prd.md` §3 when adding a module to check which tables/fields are still missing.
