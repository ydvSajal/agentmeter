export const approvalResults = ["APPROVED", "DENIED", "EXPIRED"] as const;
export type ApprovalResult = (typeof approvalResults)[number];
export const approvalCopy: Record<
  ApprovalResult,
  { title: string; detail: string }
> = {
  APPROVED: {
    title: "Human approval verified",
    detail:
      "The gateway verified this approval. Device access still requires a successful decision and device acknowledgment. Check the session for its current state.",
  },
  DENIED: {
    title: "Approval denied",
    detail:
      "Human approval was not granted. This response does not grant device access. Return to the session to review the outcome.",
  },
  EXPIRED: {
    title: "Approval expired",
    detail:
      "This approval is no longer valid. Return to the session and start a fresh approval if it is still awaiting review.",
  },
};
export function isApprovalResult(value: unknown): value is ApprovalResult {
  return (
    typeof value === "string" &&
    (approvalResults as readonly string[]).includes(value)
  );
}
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function approvalResponse(result: ApprovalResult, sessionId: string) {
  const copy = approvalCopy[result];
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${result} | AgentMeter</title><style>body{margin:0;background:#171719;color:#f2f2f3;font:16px/1.7 system-ui}main{max-width:620px;margin:10vh auto;padding:24px}h1{font-size:32px;line-height:1.3}p{color:#b4b4bd}a{color:#f2f2f3}section{border:1px solid #444448;border-radius:6px;padding:28px;margin-top:32px}code{overflow-wrap:anywhere}small{color:#a2a2a9}a:focus-visible{outline:2px solid #73a8df;outline-offset:5px}</style></head><body><main><a href="/devices">AgentMeter / Device control</a><section><small>World ID approval result</small><h1>${result}</h1><h2>${copy.title}</h2><p>${copy.detail}</p><p>Session <code>${escape(sessionId)}</code></p><a href="/sessions/${encodeURIComponent(sessionId)}">Review session &rarr;</a></section></main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      },
    },
  );
}
function failure(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
/** The gateway owns OIDC state, nonce, PKCE and identity verification. */
export async function handleWorldCallback(
  request: Request,
  config: { gateway?: string; fixture: boolean },
  fetcher: typeof fetch = fetch,
) {
  const query = new URL(request.url).searchParams;
  const code = query.get("code"),
    state = query.get("state"),
    error = query.get("error");
  if (
    config.fixture ||
    !config.gateway ||
    !state ||
    (!code && !error) ||
    (code && error)
  )
    return failure(
      "Approval unavailable or callback parameters missing. Return to the session to retry.",
      400,
    );
  try {
    const url = new URL(`${config.gateway.replace(/\/$/, "")}/stepup/callback`);
    url.searchParams.set("state", state);
    if (error) url.searchParams.set("error", error);
    else url.searchParams.set("code", code!);
    const response = await fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Gateway callback failed");
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("result" in body) ||
      !isApprovalResult(body.result) ||
      !("sessionId" in body) ||
      typeof body.sessionId !== "string" ||
      !body.sessionId
    )
      throw new Error("Invalid approval result");
    return approvalResponse(body.result, body.sessionId);
  } catch {
    return failure(
      "Approval could not be verified. No access is granted by this callback. Return to the session and try again.",
      502,
    );
  }
}
