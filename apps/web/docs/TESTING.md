# Testing and demo guide

## Automated contract and safety tests

From the repository root:

```sh
pnpm --filter @agentmeter/web typecheck
pnpm --filter @agentmeter/web test
pnpm --filter @agentmeter/web build
```

The 24 tests in `test/frontend.test.ts` and `test/approval-start.test.ts` cover shared-schema compatibility for every sample row; tinybar precision beyond the JavaScript safe integer range; fractional, zero and exceeded budgets; all eight session states and the expiry boundary; explicit fixture/live selection; independent endpoint failure recovery; malformed gateway data; all three callback results; provider denial; missing state; malformed approval responses; HTML escaping; HTTPS approval destinations; encoded opaque IDs; and fixture-mode prevention of real approval requests. They run with the repository's root Vitest dependency.

These tests prove frontend contracts and display safety. They do not prove real identity verification, chain settlement, signature verification on ESP32, or physical relay behavior.

## Browser smoke checks

The browser script uses the **installed design taste skill's zero-dependency CDP driver** and a local Chrome/Edge installation. Its default driver path is `~/.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs`; set `BROWSER_DRIVER_MODULE` to an alternative absolute module path if needed. The driver is a development aid, not a production dependency. Without it, run the unit/build checks and the manual checklist below.

With the fixture frontend running:

```sh
pnpm --filter @agentmeter/web test:browser
```

This checks search and status filtering, the no-results message, exact budget ratios, audit navigation, safe-stop/cancelled/expired gates, the exact approval amount/duration, all three simulated outcomes, unknown-session errors, and browser exceptions.

For the live HTTP/SSE path, run the [contract harness and frontend](DEVELOPMENT.md#httpsse-contract-harness) with `NEXT_PUBLIC_FIXTURES=0` and gateway URL `http://127.0.0.1:8788`, then:

```sh
pnpm --filter @agentmeter/web test:browser --live
```

The live run additionally checks real callback forwarding for APPROVED/DENIED/EXPIRED; an SSE state transition from ACTIVE to SAFE_STOP; independent failure of `/agents` while devices remain visible; and an empty gateway dataset. It resets the harness before and after the run. Point `WEB_URL` at a different frontend port if needed. Never point `TEST_GATEWAY_URL` at a production service.

## Visual checks

The taste skill draws the Data Terminal direction and inspects the rendered fleet at **1440×900**, **768×1024**, and **390×844**. Check the budgets, audit, receipt and approval views at desktop and phone widths too. Confirm no page-level horizontal overflow, readable labels, visible focus, reachable row actions, a folded mobile navigation, and unclipped opaque IDs.

The table intentionally scrolls inside its frame on a phone; its session column stays visible. The page itself must not scroll sideways. Reduced motion removes transitions and animation. Device illustration icons are nonessential and hidden from assistive technology. Status filters are a pressed-button group with native keyboard behavior, not incomplete ARIA tabs.

## Two-minute fixture walkthrough

1. Open `/devices` from the public homepage's **Open dashboard** link. The notice says **Demo workspace**. Inspect online/offline nodes, heartbeat ages, relay states and prices.
2. Select **Offline**; only the ventilation unit remains. Search for a nonexistent device and clear the filters.
3. Inspect Workshop fan and open its receipt. The timer is consistent with the fleet panel and decreases without a refresh.
4. Open `/agents`. Spend is **1.62 HBAR** across the three sample agents. Budget usage is **42%**, **17.5%**, **85%**.
5. Open `/audit`. Each of the five loaded records links to its session. No transaction or storage root is fabricated for the demo.
6. Open **Explore demo states → Human approval**. Verify **esp32-03**, **20 minutes**, **0.40 HBAR** before previewing APPROVED, DENIED and EXPIRED.
7. Open safe-stop and cancelled scenarios. Both show a clear banner and locked access.
8. Open the expired timer. Even if its last gateway state says ACTIVE, the gate is locked at zero.

## Acceptance matrix

The public site adds `/` for the landing page and `/docs` for the guide index. With the site running, `pnpm --filter @agentmeter/web test:public` checks the product-preview tabs, exact receipt calculator, access-stage selector, all 14 public guides and raw Markdown downloads without authentication, guide search, unknown-guide 404s, dashboard navigation, and overflow at 1440/768/390 pixels. The same installed browser driver described above is used. Refresh product screenshots with `pnpm --filter @agentmeter/web capture:product` against the running fixture-mode production server.

| Brief item | Evidence |
| --- | --- |
| W1 scaffold, layout, dark navigation | App routes, `app-shell.tsx`, package/config files; build and three-width screenshots |
| W2 client and SSE, fixtures | Shared typed client, runtime schemas, `use-sse.ts`, `use-resource.ts`, boundary tests, live harness event test |
| W3 devices | Filter/search browser checks; visible status, heartbeat, relay and exact rate |
| W4 session receipt | Shared SessionView, countdown, all-state access tests, browser stopped/expired gates, evidence links |
| W5 budgets | BigInt money and precise usage tests; browser checks 42 / 17.5 / 85 |
| W6 audit | Five linked fixture records, exact evidence columns; live HTTP response validation |
| W7 World review/callback | Exact-action view and re-read; three strict result tests, provider denial, live harness callback forwarding |
| W8 demo polish | Big countdown, demo state navigation, stopped banners, responsive inspection |
| Clear docs and architecture | README, architecture diagrams, setup/environment table, this guide and handoff status |

Production integration acceptance must still be run with the real gateway: confirm all dashboard routes, valid HTTPS authorization URLs, state/nonce/PKCE verification, single-use callback behavior, deny/expiry propagation, and actual device acknowledgments. The production gateway implementation is outside this frontend lane; see [Status](STATUS.md) for that boundary.
