# Project State (live)

**Read this first after any context compaction.** It is auto-printed by the `SessionStart` (compact) hook in `.claude/settings.json`. Update it at every milestone and before ending a session (rule in `CLAUDE.md`). Keep it short: facts that survive compaction, not narrative.

_Last updated: 2026-11-07 by Agent B (`agent-b/firmware-web-docs`; 24/24 on-board tests passed)_

## Where we are
- Backend B1–B6/B8 and web W1–W8 are implemented/merged. Gateway domain/scenarios use fake external adapters. Neon and Render are deployed; Vercel production is now configured for Render and redeployed Ready.
- Agent A owns payer CLI, real Hedera/HCS/0G/World adapters and gateway port wiring. G1 (real payment) and the full paid physical-device unlock remain unproven.
- Agent B owns firmware, web deployment and docs. Receipt verification, persistent replay guard, timer, authenticated ack and CA-verified WSS compile; 24/24 on-board tests passed, relay OFF. Small-OLED status/countdown UI flashed. Windows hotspot was OFF (OLED WIFI WAIT); actual Render WSS is pending Wi-Fi restoration. Details: `docs/AGENT-B-HANDOFF.md`.

## Deployed (2026-11-06)
- Gateway: https://agentmeter-gateway.onrender.com (Render free, Singapore, service srv-dbn08gh5efls738ogo90, `ADAPTERS=fake`, `NOTIFY_ENABLED=false`). `/health` ok, db ok.
- Web: https://agentmeter-jet.vercel.app (Vercel `agentmeter`, root `apps/web`). Production `NEXT_PUBLIC_GATEWAY_URL` and `GATEWAY_SERVER_URL` point to Render, `NEXT_PUBLIC_FIXTURES=0`. Landing/devices/docs/Markdown return HTTP 200; rendered dashboard says Live gateway.
- DB: Neon project `agentmeter` (raspy-silence-29998914), migration 0001 applied, device d1 + agent a1 seeded. Secrets live in Render env only.
- Placeholder Hedera IDs (0.0.1001/1002) until owner keys. Free plan sleeps and drops device WS: upgrade to Starter for demo. Resend not wired: needs RESEND_API_KEY + NOTIFY_TO, then NOTIFY_ENABLED=true.

## Repo and PRs
- GitHub: https://github.com/ydvSajal/agentmeter (public, MIT). Default branch `main`.
- PRs #1 (docs), #2 (scaffold), #3 (shared contracts) are **merged into `main`** (merge commits, CI green). Lanes may now branch from `main`. Stacked-PR procedure for future work: `docs/WORKFLOW.md` §3.
- `packages/shared` now has: zod schemas, ports, fakes, `AgentMeterError` codes, `withTimeout`, receipt encode/sign/verify, typed gateway client, test vector `test-vectors/receipt.json` (public TEST key). 14 tests pass.
- Scripts: `node packages/shared/scripts/gen-keys.ts` (new signing seed + public key), `gen-vector.ts` (regenerate vector). Node ≥22.18 or 26 needed to run `.ts` scripts directly.
- Local: Windows, Node 26, pnpm 11. `reference/paybot` cloned (git-ignored).
- Git identity in repo config: Sajal. Commits end with the Co-Authored-By and Claude-Session trailer lines.

## Lanes (parallel sessions via worktrees, see `docs/WORKFLOW.md`)
| Lane | Status | Next task |
|---|---|---|
| core | K1–K4, N1/N2 done; Agent B adds README flow/evidence, architecture SVG and World debrief | Fill real sponsor evidence after Agent A's live runs |
| web | W1–W8 merged; Vercel redeployed with live gateway configuration | Approval-start URL contract from Agent A; real World end-to-end check |
| backend | B1-B6, B8 done; fail-safe hardening (#13) merged. `pnpm demo:scenarios` runs 8 demo cases (35 checks) against the real gateway + simulated ESP32 on fakes; also a CI step | B7 agent CLI (real signer needs owner Hedera keys); real adapters C1/C3/C4/C5/C6 |
| web3 | C2 real facilitator adapter merged; other real adapters belong to Agent A | C1 first payment + C3 HCS need owner Hedera keys; C4/C5 need 0G key; C6 needs World client |
| firmware | ESP32-S3 Wi-Fi/NTP/WS/OLED merged. Agent B receipt/TLS and self-test builds compile | Run on-board tests; pin production public key and device HMAC/token; confirm GPIO4 active-low and physical relay behavior |

## Decisions in force
See `docs/DECISIONS.md`: settle-on-ack, any 0G failure → SAFE_STOP, ports/fakes and L0–L3 layers. AD034–AD037 cover Neon, Resend, Render and dual Prisma providers (SQLite dev/tests, derived Postgres schema/migrations for Neon). Neon/Render are live; Resend is disabled pending credentials. Catch-all + boot recovery prevent hanging sessions; failed settlement switches the device off. Deployment: `docs/DEPLOY.md`, `render.yaml`. Known accepted demo risks: WS token in query string, unauthenticated reads/callback (AD032–AD033).

## Blocked on the owner (ask, never invent)
- Hedera testnet accounts and keys: operator, payTo, agent (payer).
- 0G API key + credits (pc.0g.ai, booth); 0G Storage wallet.
- World portal client (auth.world.org/portal) and redirect URI.
- Hardware commissioning: confirm relay GPIO4/polarity and low-voltage load; production device token/HMAC and gateway public receipt-signing key.
- Submission deadline (reported Sun 8 Nov 09:00 IST, not on prizes page).

## Open technical questions
0G request ID on Router path · 0G Storage SDK package/API · Hedera SDK package (`@hashgraph/sdk` vs `@hiero-ledger/sdk`) · `@x402/hedera` on npm or monorepo source · x402 middleware verify/settle split · Ed25519 on ESP32 (`rweather/arduinolibs`).

## Gotchas learned
- pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` (esbuild: true).
- Prizes page lists no deadline. Definitive and Chainlink resources are irrelevant to us.
- Paybot has no ESP32/receipt/policy/World/0G code; only the Hono resource-server shape and UX ideas are reusable.
- Two sessions share this repo: Session A (backend/web3/firmware/docs) and Session B (frontend `apps/web`). Session B should work in its own worktree (`.worktrees/web`); never commit another lane's files.
- `gh pr merge` by Claude is blocked by the auto-mode classifier; the owner merges PRs (bottom-up) or adds a permission rule.
- DB: Prisma 6 + SQLite. `pnpm --filter @agentmeter/db db:push` then `seed` (device d1, agent a1; dev token `dev-token-d1`, HMAC `dev-hmac-d1`). Relative `DATABASE_URL=file:./dev.db` resolves next to `packages/db/prisma/schema.prisma`.
- Flasher: `pnpm --filter @agentmeter/flasher start` then http://localhost:5174 in Chrome/Edge. Flash PlatformIO .bin files and read serial output. Verified in-browser only (load, presets, no console errors); real flashing untested until the board is plugged in.
- DB tests/gateway tests use real SQLite; `createDb` uses one connection + long transaction limits (writes queue instead of SQLITE_BUSY). vitest in gateway runs files serially with 30s timeouts.
- x402 facts (verified 2026-11-06): `@x402/hedera`/`core`/`fetch`/`hono` 2.30.0 are on npm. Facilitators x402.org (fee payer 0.0.9185802) and Blocky402 (0.0.7162784) both list hedera:testnet. World OIDC discovery works (authorize/token/jwks under auth.world.org/api/v1). Run real-facilitator live tests with `LIVE=1 pnpm --filter @agentmeter/chain test`.
- `pnpm demo:scenarios` boots the real gateway in-process (temp SQLite, fake payment/0G/World) with a simulated ESP32 and drives: happy path, replay, step-up denied, step-up approved, 0G down (SAFE_STOP), no ack, device offline, settle failure. Run it before recording the demo. `src/gateway.ts` is the shared assembly used by main.ts and the runner.
