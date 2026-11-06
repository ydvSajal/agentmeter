# AgentMeter frontend

A control room for agent-paid access to physical devices. Built with Next.js App Router, strict TypeScript, Tailwind 4, shadcn-style UI primitives, and a locally vendored React Bits interaction.

## Start here

From the repository root, with Node 22.18+ (Node 26 recommended for the contract harness) and pnpm 11:

```sh
pnpm install
pnpm --filter @agentmeter/web dev
```

Open **http://127.0.0.1:3000**. Without a gateway URL the frontend uses a labeled demo workspace. No accounts, keys, payments, or hardware are needed.

| What you need | Read |
| --- | --- |
| System boundaries, diagrams, modules, data flow | [Architecture](docs/ARCHITECTURE.md) |
| Configuration, real gateway setup, troubleshooting | [Development guide](docs/DEVELOPMENT.md) |
| Tests, demo walkthrough, acceptance checklist | [Testing and demo guide](docs/TESTING.md) |
| Implementation status and remaining backend integration | [Handoff status](docs/STATUS.md) |

## Screens

| Route | Purpose |
| --- | --- |
| `/` | Public landing page; product explanation, interactive access flow and documentation links |
| `/docs` | Public documentation hub with guide search; no login required |
| `/docs/[slug]` | Readable setup, dashboard, architecture, API, testing and project guides |
| `/docs/[slug]/raw` | Download the guide as Markdown |
| `/devices` | Device fleet; status/search filters; relay and heartbeat; latest live session |
| `/agents` | Spend versus daily cap, fractional usage, remaining budget, over-cap state |
| `/audit` | Session state, HashScan transaction, HCS sequence, 0G request ID and storage root |
| `/sessions/[id]` | Receipt countdown, access gate, timeline, full verification evidence |
| `/step-up/[sessionId]` | Review the exact action before World ID authorization |
| `/api/world/callback` | Server-only forwarding of World callback to the gateway; APPROVED / DENIED / EXPIRED result |
| `/demo/approval/[result]` | Fixture-only outcome previews; never grants device access |

Use **Explore demo states** on the fleet or receipt screen to inspect active, approval-required, safe-stop, cancelled, and expired scenarios. Unknown sessions show an error with retry.

## Checks

```sh
pnpm --filter @agentmeter/web typecheck
pnpm --filter @agentmeter/web test
pnpm --filter @agentmeter/web build
```

The [testing guide](docs/TESTING.md) explains the local HTTP/SSE gateway harness and browser checks. Production gateway routes and external services are separate integration work; fixture or harness success is not evidence of real payments or World identity verification.

## Visual direction and credits

Taste skill **Data Terminal**, seed `424055284`: flat neutral darks, one blue selection line, Public Sans text, IBM Plex Mono figures, relay-node drawings, and a payment → decision → receipt → relay path. Figures use monospace deliberately. Fonts load from Google Fonts with system fallbacks. There are no design redraws. Sample data lives in `src/lib/fixtures.ts` and is validated against shared schemas by the tests.

[React Bits FadeContent](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Animations/FadeContent/FadeContent.tsx) is vendored in `src/components/react-bits/` for the device inspection interaction; reduced-motion preferences are respected. See the upstream repository for its license. The GigTrust reference was unavailable to the web reader, so this implementation does not claim to reproduce that design. UI Sky was not available as a component tool.

The frontend stays inside `apps/web/**` and imports only browser-safe L0 shared contracts. It contains no payer wallet, signing key, World client secret, database client, or gateway domain code.
