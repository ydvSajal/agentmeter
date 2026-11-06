# Deploy: Neon (database) + Render (gateway)

Decisions: AD034 (Neon), AD036 (Render), AD037 (dual Prisma provider). Spec: `docs/SPEC-NEON-RESEND.md`.

## How the DB provider works
- `packages/db/prisma/schema.prisma` is the source of truth and stays SQLite-compatible. Dev and tests run on SQLite files (no Postgres needed, CI unchanged).
- `prisma/postgres/schema.prisma` and `prisma/postgres/migrations/` are for Neon. The schema is **generated** (`pnpm --filter @agentmeter/db schema:pg`); a test fails if it drifts.
- Changing a model: edit `schema.prisma`, run `schema:pg`, then create the next migration SQL:
  `npx prisma migrate diff --from-schema-datamodel <old pg schema> --to-schema-datamodel prisma/postgres/schema.prisma --script` into `prisma/postgres/migrations/<n>_<name>/migration.sql`.

## One-time setup
1. **Neon:** create a project in `aws-ap-southeast-1` (Singapore). Copy two strings: the **pooled** one (host contains `-pooler`) and the **direct** one. Append `?sslmode=require` if missing.
2. **Render:** New > Blueprint > this repo (`render.yaml`). Set the `sync:false` env vars in the dashboard:
   - `DATABASE_URL` = Neon pooled string, plus `&pgbouncer=true&connect_timeout=10`
   - `DIRECT_URL` = Neon direct string
   - `RECEIPT_SIGNING_KEY_ED25519` = output of `node packages/shared/scripts/gen-keys.ts` (private seed, server only)
   - `SEED_DEVICE_TOKEN`, `SEED_DEVICE_HMAC_SECRET` = values that match the device's `secrets.h`
   - `HEDERA_PAYTO_ACCOUNT_ID`, `AGENT_HEDERA_ACCOUNT_ID` when known
3. Deploy. Build runs: install, `generate:pg`, `migrate:pg` (applies migrations to Neon), `seed` (idempotent upsert).
4. Check `https://<service>.onrender.com/health`: expect `{"ok":true,"db":"ok",...}`.

## Point the device at Render
Render terminates TLS on 443, so the board must use `wss://` (firmware `WS_TLS`, follow-up task). Until that lands, keep the laptop gateway for the real board.

## Run Postgres locally against Neon (optional check)
```
DATABASE_URL=<pooled> DIRECT_URL=<direct> pnpm --filter @agentmeter/db generate:pg
DATABASE_URL=<pooled> DIRECT_URL=<direct> pnpm --filter @agentmeter/db migrate:pg
DATABASE_URL=<pooled> ADAPTERS=fake pnpm --filter @agentmeter/gateway start
```
After this, `pnpm install` (or `pnpm --filter @agentmeter/db generate`) regenerates the SQLite client for tests.

## Gotchas
- One generated Prisma client exists at a time: after `generate:pg` the client is Postgres-only; tests need the SQLite one back (`generate`).
- Neon free compute sleeps when idle; the gateway pings the DB every 4 min and fails fast at boot if it cannot reach it.
- Render free web services sleep and drop device WebSockets: use Starter for the demo.
