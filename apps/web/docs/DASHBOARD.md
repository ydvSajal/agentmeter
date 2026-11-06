# Using the dashboard

AgentMeter shows how an agent's payment request becomes time-limited access to a physical device. You can browse the landing page, dashboard and documentation without creating an account or signing in.

## Open a workspace

Use **Open dashboard** on the [homepage](/) or go directly to [Device control](/devices). The local frontend defaults to a **Demo workspace** with sample devices and receipts. That notice means you are exploring the interface; no real payment or hardware action is taking place.

Live mode connects to a configured gateway. Its data can be real or come from the development contract harness. A successful frontend connection is not, by itself, proof that external payment, identity and device integrations are live. See [Frontend status](STATUS.md).

## Inspect a device

The device fleet shows each node's name, connection status, last heartbeat age, last reported relay state, and price per minute.

- Use **Online**, **In use**, or **Offline** to narrow the list.
- Search by device name or ID.
- Select the arrow on a device to open its inspection panel.
- If the latest session belongs to that device, use **View session** to inspect its receipt.

The relay state is the gateway's last report. The browser cannot turn the relay on by changing a control or an on-screen state.

## Follow a session

Open a session from [Audit trail](/audit) or the latest live-session preview. The receipt page shows the device, agent, requested duration, exact amount, receipt expiry, state timeline and recorded verification evidence.

| State | What it means for access |
| --- | --- |
| PENDING | The request is being checked. Access is locked. |
| STEP_UP | The exact action needs human approval. Access is locked. |
| DECIDING | The decision service is evaluating the request. Access is locked. |
| ISSUED | A receipt was issued; the device still needs to acknowledge it. |
| ACTIVE | Access is shown unlocked only while the receipt is unexpired and its state can be verified. |
| SETTLED | The session completed; review the recorded transaction and evidence. |
| CANCELLED | Access was cancelled. The session does not grant access. |
| SAFE_STOP | A required check failed. Access remains locked. |

A countdown reaching zero locks the displayed gate even if the latest recorded state still says ACTIVE. The device has its own receipt-expiry checks; the browser's timer does not enforce physical access.

## Review an agent budget

The [Agents](/agents) page compares each agent's spend today with its daily cap. The amount remaining is calculated from exact base-unit values. Usage can exceed 100% in the reported data; the bar stops at 100% and the text marks the excess.

HBAR amounts preserve tinybar precision. Other assets display their base units and asset identifier rather than assuming an unknown token-decimal conversion. The gateway enforces the actual spending policy.

## Read the audit evidence

The [Audit trail](/audit) links every loaded record to its session. When available, it includes:

- A transaction link to Hedera testnet on HashScan.
- The Hedera Consensus Service sequence number.
- The 0G decision request ID.
- The 0G storage root hash.

Missing evidence is shown as a dash or **Not recorded**. The interface does not invent a transaction or storage proof for a sample session. On a phone, scroll the audit table within its frame to inspect the remaining columns.

## Approve an exact action

An approval-required session links to a review of the exact device, agent, duration and amount. In live mode, **Continue to World ID** rechecks the action before redirecting to the gateway-issued authorization URL.

The result can be APPROVED, DENIED or EXPIRED. An approved identity checkpoint lets the gateway continue its checks; it does not independently unlock the device. Denied, expired and unverifiable callbacks never present a successful authorization.

In demo mode, **Explore demo states** links to an approval-required example. Preview each outcome without verifying an identity or changing device access.

## Recover from a connection error

Use **Refresh** or **Retry** when an endpoint fails. Previously loaded blocks remain visible with a stale-data warning rather than disappearing. Session access is shown locked or unverified if its state cannot be refreshed.

The event stream updates the workspace when device or session events arrive. While the tab is visible, a 15-second polling fallback also requests fresh data. Returning to the tab triggers a refresh.

## Build or integrate next

For setup, read [Getting started](DEVELOPMENT.md). For implementation details, read [Frontend architecture](ARCHITECTURE.md), [the API reference](/docs/api), and [Testing and demo](TESTING.md). All of these guides are public.
