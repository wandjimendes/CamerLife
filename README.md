# Cameroon Life

A browser MMO life sim set in Cameroon. Phase 1: create a character and family,
walk around Douala, buy or rent a home and furnish it, apply for a job and work
5‑minute shifts to earn FCFA.

## Stack

| Piece | Tech | Hosting |
|---|---|---|
| `apps/client` | Vite + React + Phaser 3, Zustand | Vercel |
| `apps/server` | Colyseus 0.16 (town & house rooms, work shifts) | Fly.io |
| `supabase/` | Postgres schema, RLS, RPCs, seed | Supabase |
| `packages/shared` | Layout, protocol, constants, DB row types | – |
| `tools/` | Map / placeholder-art / seed generators, SQL check | – |

`packages/shared/src/layout.ts` is the single source of truth for the world:
it is rendered into the Tiled map (`gen:map`), the DB seed (`gen:seed`), and is
used by the server to validate door interactions.

## Local development

Requirements: Node 20+. No Supabase account needed for the offline mode.

### Offline (zero config)

`npm run dev:db` starts a local Supabase stand-in: an in-process Postgres
(PGlite) with the real migration + seed behind a GoTrue/PostgREST-compatible
HTTP API. RLS and the RPCs behave exactly as on Supabase.

```bash
npm install
npm run dev:db -- --write-env   # terminal 1: mock Supabase on :54321, writes apps/*/.env
npm run dev:server              # terminal 2: Colyseus on :2567
npm run dev:client              # terminal 3: Vite on http://localhost:5173
```

Data is in-memory by default (`--persist` keeps it in `.pglite/`). The
admin CLI below works against it too.

Behind a tunnel or cloud preview, set `VITE_SUPABASE_URL=/supabase` and
`VITE_COLYSEUS_URL=/colyseus` so the browser talks to Vite only (same
origin, no CORS) and Vite proxies to the two local services.

### Against a real Supabase project

```bash
# 1. Database — in the Supabase SQL editor (or `supabase db push`) run, in order:
#      supabase/migrations/20261010000000_phase1_schema.sql
#      supabase/seed.sql

# 2. Environment
cp apps/client/.env.example apps/client/.env   # VITE_SUPABASE_URL / ANON_KEY / COLYSEUS_URL
cp apps/server/.env.example apps/server/.env   # SUPABASE_URL / SERVICE_ROLE_KEY / CORS_ORIGINS

# 3. Run
npm run dev:server    # Colyseus on ws://localhost:2567
npm run dev:client    # Vite on http://localhost:5173
```

Other scripts:

```bash
npm run typecheck     # all workspaces
npm run build         # all workspaces
npm run gen           # regenerate assets, map and seed from packages/shared
npm run preview:map   # render the Douala map to /tmp/logs/douala-preview.png
npm run check:sql     # apply migration + seed to an in-process Postgres (PGlite)
                      # and smoke-test every RPC + RLS policy. Run after any schema change.
npm run dev:db        # local Supabase stand-in (see "Offline" above)
```

## Admin (Phase 1 CLI)

Jobs are admin-managed. Until the Admin Panel ships (Phase 2), use the CLI
from `apps/server` (uses the service role key in `apps/server/.env`):

```bash
cd apps/server
npm run admin -- applications                 # pending job applications
npm run admin -- approve <appId> [salary]
npm run admin -- reject <appId>
npm run admin -- employees | fire <empId> | salary <empId> <amount>
npm run admin -- jobs | job <buildingSlug> "<title>" <salary> <slots>
npm run admin -- players | make-admin <userId>
npm run admin -- list-unit <unitSlug> sale|rent|none [price]
```

## Deployment

**Supabase** – run the migration and seed as above. Enable email/password auth.
Signup metadata (`first_name`, `family_name`, `hair`, `skin`, `clothes`,
`family_role`) is turned into `families` / `users` / `family_members` rows by
the `on_auth_user_created` trigger, which also grants a random starting budget
(50k / 500k / 5M FCFA).

**Server (Fly.io)** – from the repo root:

```bash
fly launch --no-deploy --config apps/server/fly.toml   # first time only
fly secrets set -a cameroon-life-server \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  CORS_ORIGINS=https://your-app.vercel.app MONITOR_PASSWORD=...
fly deploy --config apps/server/fly.toml --dockerfile apps/server/Dockerfile
```

**Client (Vercel)** – import the repo, set the root directory to `apps/client`
(`vercel.json` handles the monorepo install/build), and set
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COLYSEUS_URL`
(`wss://cameroon-life-server.fly.dev`).

## Security model

- Balances, ownership, employment and shifts are never written by the client.
  They change only through `SECURITY DEFINER` RPCs (`buy_unit`, `rent_unit`,
  `apply_for_job`, …) or by the game server using the service role key.
- Server-only RPCs (`start_shift`, `complete_shift`, `abandon_shift`) and admin
  RPCs check `is_service_role()`, which trusts **only** the JWT `role` claim —
  see the comment in the migration for why a `current_user` fallback is unsafe.
- `npm run check:sql` asserts these guarantees (RLS visibility, denied direct
  updates, server-only and admin-only errors) on every run.
