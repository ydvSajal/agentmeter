# Frontend handoff

Updated 2026-11-06. Scope: `apps/web/**` only; other lanes' uncommitted work is preserved. This file records the web milestone without editing the core lane's `docs/STATE.md`.

## Implemented

- Public landing page at `/`, device control at `/devices`, and an anonymous documentation site at `/docs` with searchable guides, table of contents, readable diagrams, code copy, source-relative links and Markdown downloads.
- Fourteen public guides include setup, using the dashboard, architecture, API/wire contracts, test/demo instructions, product/technical specs, decisions, workflow, scope, resources and frontend status. The allowlist prevents arbitrary filesystem exposure.

- W1–W8 frontend surfaces: scaffold/theme/nav, browser-safe shared client, fixture mode, SSE/fallback polling, fleet, budgets, audit, receipt, exact-action review and callback result rendering.
- Demo navigation for active, approval-required, safe-stop, cancelled and expired receipts; APPROVED/DENIED/EXPIRED previews only in fixture mode.
- Independent endpoint error handling; last-good blocks retained with stale notices; failed session verification locks the displayed gate.
- Exact base-unit money, hundredth-percent budget ratios, empty/loading/error states, route error/not-found screens, keyboard filter buttons, skip navigation, mobile navigation and scroll-contained audit table.
- Architecture, development, test/demo and handoff documentation within this lane.

## Verification

- The public landing page, all 14 guide routes and their Markdown downloads passed anonymous production HTTP/browser checks. Guide search, product-preview tabs, receipt calculator and stage controls worked; unknown guides returned 404.
- Public landing inspection passed at 1440/768/390 with zero failures. All 28 frontend tests and the production build passed. Public navigation and documentation pages had no page overflow or browser exceptions. Four real product screenshots illustrate the landing page.

- All 24 frontend tests passed on the final implementation: 18 contract/safety tests and 6 approval-start tests. Amount formatting uses explicit `en-US` grouping so server and browser output agree.
- TypeScript passed after the data-layer and component split.
- The final Next.js production build passed, including the public landing page, all documentation/download paths, dashboard routes and TypeScript validation.
- Production fixture-browser checks passed: filters, search empty state, fractional budgets, audit records, stopped/expired gates, exact-action review, all three outcome previews, unknown-session errors; no browser exceptions.
- Final fleet browser inspection passed at 1440, 768 and 390 pixels with zero failures. The retained warnings concern secondary 11–12px metadata and the numeric count badge. Screenshots were visually reviewed at all three widths.
- Source design lint passed with zero failures. Its pegboard dots are an intentional schematic pattern; monospace figures, relay bits and padded clock values are data, and “unlock” describes the actual device action. Unused upstream FadeContent effects remain vendored but are not enabled.
- Live HTTP/SSE contract-harness browser checks passed: all three server-forwarded callback results, an ACTIVE→SAFE_STOP event with a locked gate, partial endpoint failure without losing the fleet, empty data, and missing sessions. No browser exceptions were reported. This establishes the frontend wire behavior, not actual external-service integration.
- Fully loaded budget and audit screens, the stopped receipt, and exact-action approval were checked at 1440px and 390px with no page-level horizontal overflow. The audit table scrolls inside its frame. Screenshots are generated under ignored `.taste-skill/screens/` by the repeatable browser script.

## Integration boundary

The current production gateway app factory exposes `/health`; dashboard and step-up routes remain separate backend-lane work. This frontend has a loopback HTTP/SSE contract harness to validate its wire behavior. The harness is not a substitute implementation of the gateway domain or OIDC provider.

Before recording real end-to-end access:

1. Supply all reads in `docs/API.md` using current shared response schemas, including nullable fields.
2. Return newest-first audit records. The live panel discovers one in-progress session from the newest 50 records.
3. Serve named SSE device/session events, allow frontend-origin CORS and avoid stream buffering.
4. Start approval with a valid HTTPS provider URL. The existing shared FakeStepUp's HTTP localhost URL is intentionally not accepted as a live provider destination.
5. Forward provider `error,state` as well as `code,state` to the gateway, and return `{ sessionId, result }` with one of the three strict result strings.
6. Configure the real World redirect URI to the Next.js `/api/world/callback` route; validate state/nonce/PKCE and exact action on the gateway.
7. Verify Hedera settlement/evidence, 0G IDs/root, device acknowledgment and relay expiry against actual services/hardware.

The browser does not hold keys or grant access. Payer CLI requests and gateway/domain changes belong to other lanes. No PR or deployment is implied by this local handoff.
