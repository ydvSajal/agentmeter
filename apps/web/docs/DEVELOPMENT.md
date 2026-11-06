# Development and integration

## Prerequisites and fixture mode

Install workspace dependencies from the repository root using Node 22.18+ and pnpm 11. The development HTTP harness imports a TypeScript fixture module directly; Node 26 is the verified runtime.

```sh
pnpm install
pnpm --filter @agentmeter/web dev
```

Default URL: `http://127.0.0.1:3000`. Demo mode is enabled if no public gateway URL is set, or explicitly with `NEXT_PUBLIC_FIXTURES=1`. The sample epoch persists per browser tab so the fleet and receipt countdowns agree. To start a new ten-minute demo window, open a new tab or clear the `agentmeter-demo-epoch` session-storage entry and reload. This storage contains only a timestamp.

## Environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and edit it. Restart Next.js after changes. Public variables are embedded at build time; production mode changes require a rebuild.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIXTURES` | On only when no gateway URL is configured | `1` forces fixtures; `0` requires live reads, even if the gateway is down |
| `NEXT_PUBLIC_GATEWAY_URL` | `http://localhost:8787` in required-live mode | Browser REST, approval start, SSE; no secrets |
| `GATEWAY_SERVER_URL` | Public gateway URL | Optional server-only callback address for containers/private networks |
| `MOCK_GATEWAY_PORT` | `8788` | Development contract harness only |
| `WEB_URL` | `http://127.0.0.1:3000` | Browser verification target only |
| `TEST_GATEWAY_URL` | `http://127.0.0.1:8788` | Browser test control target only |
| `BROWSER_DRIVER_MODULE` | Installed taste skill's CDP driver | Optional browser-check driver path |

Never put a Hedera key, World client secret, 0G credential, signing seed, or device token in a `NEXT_PUBLIC_*` variable.

## Real gateway

```dotenv
NEXT_PUBLIC_FIXTURES=0
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8787
```

Start the separately owned gateway service according to its documentation. The frontend requires these contracts:

| Endpoint | Required behavior |
| --- | --- |
| `GET /devices` | DeviceView array: ID, name, ONLINE/OFFLINE, nullable heartbeat, relay, pricePerMinute, asset |
| `GET /agents` | AgentView array: dailyCap and spentToday in base-unit strings |
| `GET /audit?limit=50` | AuditRow array, newest-first; all nullable evidence fields present |
| `GET /sessions/:id` | SessionView including chronological events and nullable expiry/evidence |
| `GET /events` | SSE named `device` and `session` events matching shared schemas |
| `POST /stepup/:id/start` | `{ authorizeUrl }`, HTTPS URL without embedded credentials |
| `GET /stepup/callback` | Accept `code,state` or provider `error,state`; return `{ sessionId, result }` |

Responses are validated by `packages/shared/src/schemas/index.ts`. Null fields must be `null` rather than omitted. Gateway failures must use the documented error envelope. Set CORS for the frontend's exact origin (including scheme and port); allow GET/POST and event-stream requests. An HTTPS deployed frontend needs an HTTPS public gateway and an event stream that is not buffered by the proxy. The browser uses no private gateway credentials.

Register World redirect URI `http://127.0.0.1:3000/api/world/callback` for the matching local origin, or your deployed HTTPS equivalent. The gateway owns the World client, nonce/state, PKCE and token verification. Its fake step-up provider currently returns an HTTP localhost URL; the frontend deliberately rejects that as a real authorization destination. Use the explicit fixture preview or a properly configured HTTPS provider.

The inspected production gateway currently exposes `/health` while its other routes are under development. A healthy `/health` response alone does not establish frontend integration readiness. The frontend's contract harness below lets development proceed without modifying that lane.

## HTTP/SSE contract harness

Terminal 1, from the repository root:

```sh
pnpm --filter @agentmeter/web dev:gateway
```

Set `.env.local` to:

```dotenv
NEXT_PUBLIC_FIXTURES=0
NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:8788
```

Terminal 2:

```sh
pnpm --filter @agentmeter/web dev
```

The frontend now uses real HTTP reads, schema validation, SSE, timeouts and server-side callback forwarding against deterministic sample data. The harness does **not** verify identity, settle money or operate hardware. Its loopback-only `/__test` endpoint injects failures and state changes for browser verification. It must never be exposed as the production gateway. Its authorization URL intentionally uses `.invalid`; the real World redirect is tested through response validation and requires the actual provider.

## Production build

```sh
pnpm --filter @agentmeter/web typecheck
pnpm --filter @agentmeter/web test
pnpm --filter @agentmeter/web build
pnpm --filter @agentmeter/web start
```

Use Node/server hosting that supports Next.js route handlers; a static-only export cannot handle the World callback. Supply public variables before building. If the server reaches the gateway by an internal address, configure `GATEWAY_SERVER_URL` at runtime. The frontend has no database or independent durable session state.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Demo workspace appears unexpectedly | Public gateway URL absent, or fixture flag set to `1`; restart/rebuild after changing env |
| “Devices/Agents/Audit unavailable” | Gateway route, CORS, exact Zod response fields; last-good data is retained with a warning |
| Reconnecting event stream | SSE route, proxy buffering, keepalive; foreground polling still runs every 15s |
| No latest live session | Only the newest 50 audit rows are considered; use a direct session link for older sessions |
| Countdown says zero | Receipt expired or no receipt was issued; local clock skew affects display only, not device verification |
| Gate locks after refresh failure | Intentional unverified state; restore gateway connectivity and retry |
| Approval URL rejected | Must be HTTPS without credentials; localhost HTTP fake-provider links are not live approval URLs |
| Callback is 400 | Missing/ambiguous parameters, absent gateway config, or fixture mode |
| Callback is 502 | Gateway rejected callback, timed out, or returned an invalid result/session ID |
| 0G root/transaction missing | Evidence not recorded by gateway; no placeholder proof is fabricated |
| pnpm/Next spawning denied on Windows | Run with the environment's process/network permission; do not disable checks |

See [Architecture](ARCHITECTURE.md) for the boundaries and [Testing](TESTING.md) for the acceptance checks.
