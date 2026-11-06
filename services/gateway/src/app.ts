/** Hono app factory. Routes are added per task (B5); B1 ships /health and the error contract. */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AgentMeterError, type ErrorCode } from "@agentmeter/shared";
import type { Logger } from "pino";
import type { AdapterModes } from "./config";
import { authRoutes, requireAuth, type AuthDeps } from "./http/auth";
import { mountApi, type ApiContext } from "./http/routes";

export interface AppDeps {
  log: Logger;
  adapters: AdapterModes;
  startedAt: number; // unix seconds
  now: () => number;
  /** Resolves true when the DB answers; omitted means no DB wired. */
  checkDb?: () => Promise<boolean>;
  /** When provided, mounts the REST + SSE routes. */
  api?: ApiContext;
  /** When set: /auth/* is mounted and dashboard reads need the login cookie; CORS becomes an exact-origin allowlist. */
  auth?: AuthDeps;
}

/** HTTP status for each stable error code (docs/API.md). */
export const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  PAYMENT_REQUIRED: 402,
  PAYMENT_UNVERIFIED: 402,
  PAYMENT_REPLAY: 409,
  POLICY_DENIED: 403,
  STEP_UP_REQUIRED: 402,
  STEP_UP_DENIED: 403,
  STEP_UP_EXPIRED: 403,
  DECISION_DENIED: 403,
  SAFE_STOP: 409, // terminal, device stays off; not a server fault
  DEVICE_OFFLINE: 409,
  DEVICE_NO_ACK: 504,
  DEVICE_REJECTED: 409,
  SETTLE_FAILED: 502,
  RATE_LIMITED: 429,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  TIMEOUT: 504,
  INTERNAL: 500,
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  const exposeHeaders = ["X-PAYMENT-RESPONSE"];
  const origins = deps.auth?.allowedOrigins;
  app.use(
    "*",
    cors(
      origins
        ? { origin: (o) => (origins.includes(o) ? o : null), credentials: true, exposeHeaders } // cookies need an exact origin
        : { origin: "*", exposeHeaders },
    ),
  );

  app.get("/health", async (c) => {
    const db = deps.checkDb ? ((await deps.checkDb().catch(() => false)) ? "ok" : "down") : "unconfigured";
    return c.json(
      {
        ok: db !== "down",
        db,
        adapters: deps.adapters,
        deps: {}, // per-dependency last-success times are filled in by the adapters
        uptimeSec: deps.now() - deps.startedAt,
      },
      db === "down" ? 503 : 200,
    );
  });

  if (deps.auth) {
    app.route("/auth", authRoutes(deps.auth));
    // Dashboard-only reads. /sessions/:id stays open (agents poll it; ids are unguessable) and the x402 POST is paid, not logged in.
    for (const p of ["/devices", "/agents", "/audit", "/notifications", "/events"]) app.use(p, requireAuth(deps.auth));
  }
  if (deps.api) mountApi(app, deps.api, deps.log);

  app.onError((err, c) => {
    if (err instanceof AgentMeterError) {
      deps.log.warn({ code: err.code, sessionId: err.sessionId }, err.message);
      return c.json({ error: { code: err.code, message: err.message, sessionId: err.sessionId } }, STATUS[err.code]);
    }
    deps.log.error({ err: err.message }, "unhandled error");
    return c.json({ error: { code: "INTERNAL" as const, message: "internal error" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "INTERNAL" as const, message: "not found" } }, 404));

  return app;
}
