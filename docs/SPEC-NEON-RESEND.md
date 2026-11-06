# SPEC: Neon Postgres + Resend

Status: draft. Supersedes the SQLite choice in TRD §2/§4 and AD013 once accepted (ADR below). Secrets are added later by the owner in local `.env`; nothing here needs a key to build or test.

## 1. Goals
- Replace SQLite with **Neon Postgres** so the gateway can run anywhere (laptop, Render/Fly) and the dashboard/audit data survives restarts and redeploys.
- Add **Resend** email as a `Notifier` port for human-facing alerts: World step-up approval link, session receipts, SAFE_STOP and device-offline alerts.
- Keep every paid-unlock invariant unchanged: 0G failure gives SAFE_STOP, payment settles only after the device acks, email never sits on the decision path.

Non-goals: no Neon Auth, no Neon Data API, no realtime/Resend inbound, no marketing broadcasts. The gateway stays one long-lived Hono process (WebSockets); Neon is only the database.

## 1b. Render (backend hosting)
Connectors available: **Render = backend (gateway)**, **Neon = database**. Render web services support WebSockets (the device link needs them; Vercel does not).
- One Render **Web Service** (Node): `pnpm --filter @agentmeter/gateway start`, health check `/health`, auto-deploy from `main`, region next to the Neon region.
- Free instances sleep after ~15 min idle, dropping the device WS: use the **Starter** plan for the demo window. Laptop gateway stays the fallback.
- Env vars live in the Render dashboard, never in git: `DATABASE_URL`, `DIRECT_URL`, `RECEIPT_SIGNING_KEY_ED25519`, `RESEND_API_KEY`, `NOTIFY_*`, Hedera/0G/World keys. Render injects `PORT`.
- Build: `pnpm install --frozen-lockfile && pnpm --filter @agentmeter/db exec prisma generate && prisma migrate deploy`.
- Firmware must use `wss://` on port 443 against Render: add a `WS_TLS` flag in `firmware/esp32/src/config.h` and switch `ws.begin` to `beginSSL`.
- Add `render.yaml` blueprint (task N8). ADR AD036: gateway on Render, data on Neon.

## 2. Neon (database)

### 2.1 Config
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`), `?sslmode=require&pgbouncer=true&connect_timeout=10`. Used by the running gateway. |
| `DIRECT_URL` | Neon **direct** (non-pooled) string. Used only by `prisma migrate`. |
| `DB_PROVIDER` | not used at runtime; documents that tests may still run on SQLite (see 2.4). |

Prisma datasource:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 2.2 Schema changes (packages/db, backend lane)
- Models unchanged (TRD §4): Device, Agent, Session, SessionEvent, StepUp, UsedNonce, plus `Agent.allowedDeviceIds`.
- SQLite workarounds become native types: `allowedDeviceIds String[]` (was JSON string), event payloads `Json` (was String), timestamps stay unix-second `Int` to match the shared schemas (no contract change).
- Add `Notification` table: `id, kind, toEmail, sessionId?, status (QUEUED|SENT|FAILED), providerId?, error?, createdAt`.
- `UsedNonce` keeps a unique constraint; replay rejection relies on the insert failing (`P2002`), which is atomic on Postgres.
- Migrations via `prisma migrate dev` (local branch) and `prisma migrate deploy` (CI/prod). Commit `packages/db/prisma/migrations`. Drop `dev.db` from the repo.

### 2.3 Branching and environments
- Neon branch `main` = demo/prod, branch `dev` = day-to-day, ephemeral branch per CI run (optional).
- `pnpm --filter @agentmeter/db seed` is idempotent (upsert) and runs against any branch.
- Free-tier compute scales to zero: first query after idle can take ~0.5-2 s. Gateway runs a cheap `SELECT 1` on boot and every 4 min while a device is online so the demo never pays a cold start. `/health` reports DB latency.

### 2.4 Testing
- Unit tests keep using fakes from `packages/shared`; repository tests run against a Neon `test` branch when `DATABASE_URL_TEST` is set, otherwise they are skipped with a logged reason (never silently pass).
- A DB failure during a decision path must surface as a typed `AgentMeterError` and end in SAFE_STOP (device stays off). Timeout for any query on the decision path: 2 s.

### 2.5 Acceptance
- [ ] `prisma migrate deploy` applies cleanly to an empty Neon branch.
- [ ] Gateway boots against Neon, `/health` shows `db: ok` with latency.
- [ ] Replay test: second insert of the same nonce fails and the session is rejected.
- [ ] Killing DB access mid-session gives SAFE_STOP, no relay-on receipt is sent.

## 3. Resend (email)

### 3.1 Port (contract change, core lane, own PR per WORKFLOW §5)
```ts
// packages/shared/src/ports.ts
export interface Notifier {
  send(msg: NotificationMessage): Promise<{ id: string }>; // throws AgentMeterError on failure
}
export type NotificationKind =
  | 'STEP_UP_REQUESTED' | 'SESSION_SETTLED' | 'SESSION_CANCELLED'
  | 'SAFE_STOP' | 'DEVICE_OFFLINE';
```
`FakeNotifier` in shared records messages for tests. Real adapter lives in `packages/chain`-style adapter package location: `services/gateway/src/adapters/resend.ts` (no other lane needs it).

### 3.2 Config
| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | server only, never in the web app |
| `NOTIFY_FROM` | verified sender. Until a domain is verified use `onboarding@resend.dev` (delivers only to the account owner's email) |
| `NOTIFY_TO` | owner/approver email (default recipient) |
| `NOTIFY_ENABLED` | `true`/`false`; false uses the no-op notifier |
| `NOTIFY_TIMEOUT_MS` | default 4000 |

### 3.3 Emails
| Kind | Trigger | Content |
|---|---|---|
| STEP_UP_REQUESTED | policy returns `step_up_required` | agent, device, amount, expiry, **approve link** to `apps/web` step-up page (existing state/PKCE flow, link is just a pointer) |
| SESSION_SETTLED | state reaches SETTLED | device, minutes, amount, Hedera tx + HashScan link, HCS topic, 0G request id/root hash |
| SESSION_CANCELLED | no ack / nack / step-up denied or expired | reason code, nothing was settled |
| SAFE_STOP | 0G or DB failure on decision path | which dependency failed, device left OFF |
| DEVICE_OFFLINE | no heartbeat for 15 s while a session is active | device id, last seen |

Plain HTML + text parts, no tracking pixels, no secrets or signing material in the body. Idempotency: Resend `Idempotency-Key` header = `${kind}:${sessionId}`; the `Notification` table records the outcome.

### 3.4 Rules
- **Never on the decision path.** Send is fire-and-forget after the state transition is persisted, with timeout and one retry. Failure marks `Notification.status=FAILED` and logs; it never changes session state and never blocks ack/settle.
- Rate cap: max 20 emails/hour per recipient (in-process counter) to protect the free quota (100/day) and avoid loops.
- The step-up link is not an auth token: approval still requires the World OIDC flow with fresh `auth_time`. A leaked email cannot approve a spend.
- Free tier note: unverified domain can only send to the account owner. For judges/demo, owner receives mail; verify a domain only if time allows (P1).

### 3.5 Acceptance
- [ ] `NOTIFY_ENABLED=false` runs the whole flow with no network calls.
- [ ] Contract test: `FakeNotifier` and the Resend adapter satisfy the same assertions (adapter test uses a mocked fetch; `LIVE=1` sends one real mail).
- [ ] Resend down or slow: session still reaches SETTLED, `Notification` row is FAILED.
- [ ] Step-up email arrives with a working link that opens the step-up page.

## 4. Work breakdown
| ID | Lane | Task | Depends |
|---|---|---|---|
| N1 | core | ADR AD034 (Neon) and AD035 (Resend); update TRD §2/§4, `.env.example`, ARCHITECTURE | none |
| N2 | core | `Notifier` port, `NotificationMessage` schema, `FakeNotifier` in shared | N1 |
| N3 | backend | Prisma provider to postgresql, native types, migrations, `Notification` model, seed, `/health` db check, keep-warm ping | N1 |
| N4 | backend | Resend adapter + wiring in `ports.ts`, `NOTIFY_*` env validation | N2 |
| N5 | backend | Orchestrator hooks: emit notifications after state transitions (non-blocking), tests with fakes | N2, N4 |
| N6 | web | Step-up page reached from email link (existing route, no change expected), audit list shows notification status | N5 |
| N8 | backend | `render.yaml`, build/start commands, firmware `WS_TLS`, deploy + smoke test | N3 |
| N7 | docs | README setup section: create Neon project/branches, create Resend key, env table | N3, N4 |

## 5. Owner inputs (added later, local `.env` only)
- Neon: pooled `DATABASE_URL`, direct `DIRECT_URL` (project + `main`/`dev` branches). Optional `DATABASE_URL_TEST`.
- Resend: `RESEND_API_KEY`, sender (`NOTIFY_FROM`), recipient (`NOTIFY_TO`).
- Never commit these; never paste into PRs or STATE.md.

## 6. ADR lines to append to docs/DECISIONS.md
- AD034 | Neon Postgres replaces SQLite; pooled URL at runtime, direct URL for migrations | Gateway must be host-independent and data durable; Prisma supports it | proposed
- AD035 | Resend behind a `Notifier` port; fire-and-forget, never on the decision path | Alerts and step-up links by email without risking safe-stop invariants | proposed

- AD036 | Gateway hosted on Render (Starter, WebSocket-capable); data on Neon | Backend and DB connectors already available; free web service sleeps | proposed

## 7. Risks
- Cold start on scale-to-zero compute: keep-warm ping, 2 s decision-path timeout, SAFE_STOP on miss.
- Postgres migration touches `packages/db` that Session B and the running gateway already use: do it in one PR (N3), keep repository method signatures identical.
- Resend sandbox sender limits: demo recipient must be the account owner's address.
