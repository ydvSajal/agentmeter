# World ID step-up debrief

Status: prepared for the live integration. No real World OIDC success or timing
measurement has been recorded here yet. Fake approvals are not World verification.

## Action and identity boundary

The human reviews device, minutes and amount at `/step-up/[sessionId]`.
World owns authentication; the gateway validates the code and identity token,
binds state/nonce/PKCE to the exact session, checks fresh `auth_time`, and atomically
consumes approval. The browser never signs a payment or grants device access.

Production callback to register with World and configure on the gateway:

`https://agentmeter-jet.vercel.app/api/world/callback`

The Next.js callback forwards `code,state` or `error,state` server-side and only
renders the strict gateway result `APPROVED`, `DENIED`, or `EXPIRED`.

## Integration seam for Agent A

The merged frontend calls `POST /stepup/:sessionId/start` and expects
`{ "authorizeUrl": "https://..." }`. Current gateway routes only expose the callback,
while session creation returns `stepUpUrl` to the payer. Agent A must provide a
safe way for the review page to retrieve the bound provider URL. An additive
start/read endpoint is one option; agree the final contract before changing both
sides. Do not approve a session merely because the review page was opened.

## Evidence to capture during real testing

| Item | Observation |
|---|---|
| First successful real authentication | Pending |
| Time from client registration to first success | Not measured |
| Approve: exact action resumes once | Pending |
| Deny: session cancelled, no receipt/settlement | Pending |
| Expired: no access, fresh attempt required | Pending |
| Reused state/code rejected | Pending |
| Old auth_time / wrong nonce / audience rejected | Pending |
| Device stays off until full authorization and receipt verification | Pending |

## Friction and improvement

Observed locally: frontend and gateway lane contracts diverged on how the approval
page obtains its provider URL. This is a project integration issue, not a claimed
World service failure. Record provider-specific friction only after the live run.

Suggested documentation improvement to evaluate: a complete agent-checkpoint
example covering exact-action binding, deny, expiry, single-use approval and a
server-forwarded callback. Final top improvement and missing-doc links are pending
the real integration experience.
