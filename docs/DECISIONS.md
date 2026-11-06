# Decisions (ADR log)

One line per decision. Newest at the bottom. Format: `ID | date | decision | why | status`. Status: `accepted`, `proposed` (needs owner OK), `superseded by ADxxx`.
For bigger decisions add a short section below the table using the template at the end.

| ID | Date | Decision | Why | Status |
|---|---|---|---|---|
| AD001 | 2026-11-06 | One gateway process (Hono) with modules, not microservices | Hackathon speed; matches Paybot's Hono resource server | accepted |
| AD002 | 2026-11-06 | pnpm workspaces; TypeScript everywhere except firmware | CLAUDE.md working rules | accepted |
| AD003 | 2026-11-06 | Do not fork Paybot; port Hono resource-server shape and UX ideas only | Paybot is EVM/bun/Vite/QUSD; we are Hedera/pnpm/Next.js | accepted |
| AD004 | 2026-11-06 | No Solidity: settle with native Hedera transfers, no Escrow port | Unlocks Hedera "No Solidity Allowed" track | accepted |
| AD005 | 2026-11-06 | Settle-on-ack is the primary design (verify first, settle after device ack) | Hedera exact spec has separate `/verify` and `/settle`; fallback: settle then refund on no-ack | accepted |
| AD006 | 2026-11-06 | Receipt = Ed25519 over canonical string `AMv1\|deviceId\|sessionId\|nonce\|notBefore\|expiresAt\|amount\|payer` | Trivial to parse on ESP32, no JSON canonicalization risk | proposed |
| AD007 | 2026-11-06 | Device ack authenticated by HMAC-SHA256 with per-device secret | Firmware needs Ed25519 verify only, no signing | proposed |
| AD008 | 2026-11-06 | 0G via Compute Router `https://router-api.0g.ai/v1`; switch to Direct SDK if no request ID | Router docs do not describe request IDs | proposed |
| AD009 | 2026-11-06 | Any 0G error, timeout (4s), or unparseable output yields `SAFE_STOP`, never ALLOW | 0G prize disqualifies faked decisions | accepted |
| AD010 | 2026-11-06 | Ports in `packages/shared` with in-memory fakes; composition root picks `ADAPTERS=fake|real` | Lets lanes work in parallel; simulation fallback for demo | accepted |
| AD011 | 2026-11-06 | Layered architecture L0 contracts / L1 adapters / L2 domain / L3 delivery; imports go downward only | Prevents lane collisions | accepted |
| AD012 | 2026-11-06 | Lanes: web, backend, web3, firmware, plus core owning `packages/shared` and docs | Parallel Claude sessions via git worktrees | accepted |
| AD013 | 2026-11-06 | Gateway not on Vercel serverless; runs on laptop, Render/Fly as backup | Needs WebSockets and SQLite file | accepted |
| AD014 | 2026-11-06 | Device connects outbound over WebSocket; phone hotspot at venue | Venue Wi-Fi client isolation | accepted |
| AD015 | 2026-11-06 | World step-up uses `max_age=0` + `prompt=login`, PKCE S256, `auth_time` checked against attempt start | World step-up guide | accepted |
| AD016 | 2026-11-06 | Money as integer base-unit strings plus asset; timestamps as unix seconds | Avoid float and timezone bugs | accepted |
| AD017 | 2026-11-06 | Stacked PRs: docs → scaffold → shared contracts; lanes branch from `main` after | Small reviewable diffs | accepted |
| AD018 | 2026-11-06 | `docs/STATE.md` is the live state file; a `SessionStart` (compact) hook in `.claude/settings.json` reprints it after compaction; root CLAUDE.md makes updating it a standing rule | A hook cannot write for the model, so the rule plus the reprint keeps context across compactions | accepted |
| AD019 | 2026-11-06 | `receipt.ts` is dependency-free (`node:crypto` only); test vector uses a public TEST seed and is reproducible because Ed25519 is deterministic | Easy to audit and port to C++; CI needs no generation step | accepted |
| AD020 | 2026-11-06 | `withTimeout` and `AgentMeterError` (code `TIMEOUT`) live in `packages/shared` | Every adapter needs the same deadline behavior (TRD §3.1) | accepted |
| AD021 | 2026-11-06 | Added `BAD_REQUEST` and `NOT_FOUND` to shared error codes (additive); step-up URL comes from the session response, no separate `/stepup/:id/start` | Honest HTTP errors; orchestrator already starts the step-up | accepted |
| AD022 | 2026-11-06 | Gateway accepts the x402 payment in `X-PAYMENT` or `PAYMENT-SIGNATURE` and sends requirements in the 402 body and a `PAYMENT-REQUIRED` header | Covers v1 and v2 x402 clients; C2 confirms the real header names | proposed |
| AD023 | 2026-11-06 | Flasher is a local Web Serial tool (`tools/flasher`, esptool-js 0.7.0), not part of `apps/web` | Needs Chrome secure context + offline at venue; keeps the dashboard lane clean | accepted |
| AD024 | 2026-11-06 | Use npm `@x402/core`/`@x402/hedera` 2.30.0 (published; no monorepo-source workaround). Hedera SDK is `@hiero-ledger/sdk` 2.90.1 as pinned by `@x402/hedera`; import its primitives via `@x402/hedera` re-exports to avoid duplicate installs | Verified on npm; package README warns duplicate SDK installs break `instanceof` checks | accepted |
| AD025 | 2026-11-06 | x402 v2 headers: request `PAYMENT-SIGNATURE` (v1 `X-PAYMENT`), 402 response `PAYMENT-REQUIRED`, settlement `PAYMENT-RESPONSE`. Gateway already accepts both request headers (supersedes AD022 proposal) | Confirmed in `@x402/core` 2.30.0 source | accepted |
| AD026 | 2026-11-06 | `HederaFacilitator` (packages/chain) builds 402 requirements itself (fee payer from facilitator `/supported`), verifies without settling, settles only after ack, idempotent per payload hash. Verified live: `x402.org` fee payer 0.0.9185802, Blocky402 0.0.7162784, both advertise `hedera:testnet` | Spec splits /verify and /settle, so settle-on-ack needs no refund fallback | accepted |
| AD027 | 2026-11-06 | Orchestrator flow never rejects: a catch-all (`failSafe`) reads the persisted state and moves `PENDING/STEP_UP → CANCELLED`, `DECIDING → SAFE_STOP`, `ISSUED/ACTIVE → CANCELLED` + device cancel; routes log any residual rejection at error | A swallowed error left sessions hanging in DECIDING/ISSUED and holding cap; uncertainty must mean device off | accepted |
| AD028 | 2026-11-06 | Settle is tried 3× (backoff `settleBackoffMs`, default 500ms); if all fail, cancel the device and move `ACTIVE → CANCELLED` unpaid (new legal transition). `SETTLED` stays reachable only from `ACTIVE` | Device switches on at ack, before settle; leaving it ACTIVE gave free usage | accepted |
| AD029 | 2026-11-06 | Step-up TTL 300s (`stepUpTtlSec`): `expireStaleStepUps` runs every 30s (unref'd timer), cancels via `move` and drops the pending payment; a callback after that throws `STEP_UP_EXPIRED` and never resumes | Sessions waiting on a human otherwise lived forever in memory | accepted |
| AD030 | 2026-11-06 | Daily cap counts settled spend plus amounts of the agent's other non-terminal sessions created today (UTC) (`sessions.reservedAmount`) | Spend only lands at settle, so concurrent sessions could overshoot the cap | accepted |
| AD031 | 2026-11-06 | `recoverOrphans()` runs once at boot before serving: PENDING/STEP_UP/ISSUED → CANCELLED ("gateway restarted"), DECIDING → SAFE_STOP, ACTIVE → CANCELLED ("gateway restarted before settlement"); never settles | Pending payments are in memory, so no pre-restart session can ever settle | accepted |
| AD032 | 2026-11-06 | Device WS token stays in the query string (`/devices/:id?token=`) | Simplest for the ESP32 client; may appear in proxy/access logs. Fix later: header or first-frame auth | accepted (risk, unfixed for demo) |
| AD033 | 2026-11-06 | Read endpoints (`/devices`, `/agents`, `/audit`, `/sessions/:id`, `/events`) and `/stepup/callback` are unauthenticated | Demo dashboard on a trusted network; callback is still bound by single-use OIDC `state`. Fix later: dashboard auth + callback shared secret | accepted (risk, unfixed for demo) |
| AD034 | 2026-11-07 | Database is Neon Postgres (replaces SQLite). Runtime uses pooled `DATABASE_URL`, migrations use `DIRECT_URL` | Gateway must be host-independent with durable data; Prisma supports both URLs. Supersedes the SQLite choice in TRD §2/§4 | proposed |
| AD035 | 2026-11-07 | Email via Resend behind a `Notifier` port, fire-and-forget after state is persisted, never on the decision path | Human alerts and step-up links without risking safe-stop; a send failure only marks `Notification` FAILED | proposed |
| AD036 | 2026-11-07 | Gateway hosted on Render Web Service (Starter plan); Neon holds data. Laptop is fallback | Needs WebSockets (Vercel cannot). Free web service sleeps and drops device link; Render free Postgres expires, so data stays on Neon | proposed |
| AD037 | 2026-11-07 | Prisma stays on a SQLite-compatible `schema.prisma` for dev/tests; the Postgres schema and migrations for Neon are derived by `scripts/gen-pg-schema.mjs` and drift-tested | Tests use throwaway SQLite files and CI has no Postgres; avoids rewriting 75+ tests. Risk: Postgres-only behavior (CAS transactions, P2002) is not covered by CI; verify with a live Neon run | accepted |
| AD038 | 2026-11-07 | Dashboard login: email+password owned by the gateway (`User`/`AuthSession`, scrypt, httpOnly `am_session` cookie storing only sha256 of the token). `/devices /agents /audit /notifications /events` require it; `GET /sessions/:id`, `/stepup/callback`, `/health` and the x402 POST stay open | Narrows AD033 (agents poll `/sessions/:id`; ids are unguessable). CORS is an exact `WEB_ORIGIN` allowlist with credentials; cross-origin POSTs are rejected. Web and gateway must share a site (127.0.0.1 in dev); prod on different domains needs `AUTH_COOKIE_SAMESITE=None` + `AUTH_COOKIE_SECURE=true`. No password reset or email verification yet | accepted |

## Device commissioning decisions

| ID | Date | Decision | Why | Status |
|---|---|---|---|---|
| AD039 | 2026-11-06 | Firmware uses rweather Crypto Ed25519 verification and mbedTLS HMAC-SHA256, matching existing receipt/ack contracts | Board self-tests verify the shared vectors and Node-compatible ack MAC; no signature fallback needed | accepted |
| AD040 | 2026-11-06 | Persist a 32-entry nonce ring atomically in NVS before relay actuation; use an ESP timer plus a monotonic lease deadline | Replay remains rejected after reboot; blocked networking and wall-clock rollback cannot extend paid running time | accepted |
| AD041 | 2026-11-06 | Render WSS/HTTPS uses an explicit GTS Root R4 CA anchor; compile time only bootstraps certificate checks, never receipt authorization | Library default/null bundle can fall back to insecure TLS; fresh NTP or verified HTTPS Date is required before unlock | accepted |
| AD042 | 2026-11-07 | Firmware patches DNS to 8.8.8.8 / 1.1.1.1 when DHCP supplies none | Windows Mobile Hotspot (ICS) leases carry no DNS; NTP and the gateway host never resolved, so the board sat at WIFI WAIT/CONNECTING | accepted |

## Template

```
### ADxxx Title
Context: what forces the decision.
Options: A, B (one line each).
Decision: what we chose.
Consequences: what gets easier/harder, what to revisit.
```
