/** Email + password auth (gateway owns users). httpOnly cookie session; raw token never stored. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Repos } from "@agentmeter/db";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../core/password";

export const COOKIE = "am_session";

export interface AuthDeps {
  repos: Pick<Repos, "users" | "authSessions">;
  now: () => number;
  allowedOrigins: readonly string[];
  allowRegistration: boolean;
  secureCookie: boolean;
  sameSite: "Lax" | "Strict" | "None";
  ttlSec: number;
}

type AuthUser = { id: string; email: string };
export type AuthEnv = { Variables: { user: AuthUser } };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const err = (c: Context, status: ContentfulStatusCode, code: "INTERNAL" | "RATE_LIMITED", message: string) =>
  c.json({ error: { code, message } }, status);

const Email = z.string().trim().toLowerCase().email().max(254);
const Register = z.object({ email: Email, password: z.string().min(10).max(200) });
const Login = z.object({ email: Email, password: z.string().min(1).max(200) });

/** Failed-login limiter per email: 8 failures / 10 min. In-process; fine for one gateway. */
function limiter(now: () => number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return {
    blocked(key: string) {
      const h = hits.get(key);
      return !!h && h.reset > now() && h.n >= 8;
    },
    fail(key: string) {
      const h = hits.get(key);
      if (!h || h.reset <= now()) hits.set(key, { n: 1, reset: now() + 600 });
      else h.n++;
    },
    clear: (key: string) => void hits.delete(key),
  };
}

export function authRoutes(deps: AuthDeps) {
  const app = new Hono<AuthEnv>();
  const limit = limiter(deps.now);

  const startSession = async (c: Context, userId: string) => {
    const token = randomBytes(32).toString("base64url");
    await deps.repos.authSessions.create({ tokenHash: sha(token), userId, now: deps.now(), ttlSec: deps.ttlSec });
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      secure: deps.secureCookie,
      sameSite: deps.sameSite,
      path: "/",
      maxAge: deps.ttlSec,
    });
  };

  // Same origin guard as requireAuth: login/register/logout are cookie-affecting POSTs.
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (c.req.method === "POST" && origin && !deps.allowedOrigins.includes(origin)) {
      return err(c, 403, "INTERNAL", "origin not allowed");
    }
    await next();
  });

  app.post("/register", async (c) => {
    if (!deps.allowRegistration) return err(c, 403, "INTERNAL", "registration is closed");
    const parsed = Register.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return err(c, 400, "INTERNAL", "enter a valid email and a password of at least 10 characters");
    const { email, password } = parsed.data;
    const user = await deps.repos.users.create({
      id: `u_${randomUUID()}`,
      email,
      passwordHash: await hashPassword(password),
      now: deps.now(),
    });
    if (!user) return err(c, 409, "INTERNAL", "that email is already registered");
    await startSession(c, user.id);
    return c.json({ user: { id: user.id, email: user.email } }, 201);
  });

  app.post("/login", async (c) => {
    const parsed = Login.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return err(c, 400, "INTERNAL", "enter your email and password");
    const { email, password } = parsed.data;
    if (limit.blocked(email)) return err(c, 429, "RATE_LIMITED", "too many attempts, try again in a few minutes");
    const user = await deps.repos.users.byEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      limit.fail(email);
      return err(c, 401, "INTERNAL", "invalid email or password");
    }
    limit.clear(email);
    await startSession(c, user.id);
    return c.json({ user: { id: user.id, email: user.email } });
  });

  app.post("/logout", async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await deps.repos.authSessions.delete(sha(token));
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/me", async (c) => {
    const token = getCookie(c, COOKIE);
    const user = token ? await deps.repos.authSessions.userFor(sha(token), deps.now()) : null;
    if (!user) return err(c, 401, "INTERNAL", "unauthorized");
    return c.json({ user: { id: user.id, email: user.email } });
  });

  return app;
}

/** Blocks unauthenticated requests, and cross-origin state-changing requests (CSRF defense in depth). */
export function requireAuth(deps: AuthDeps): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const method = c.req.method;
    const origin = c.req.header("origin");
    if (method !== "GET" && method !== "HEAD" && origin && !deps.allowedOrigins.includes(origin)) {
      return err(c, 403, "INTERNAL", "origin not allowed");
    }
    const token = getCookie(c, COOKIE);
    const user = token ? await deps.repos.authSessions.userFor(sha(token), deps.now()) : null;
    if (!user) return err(c, 401, "INTERNAL", "unauthorized");
    c.set("user", { id: user.id, email: user.email });
    await next();
  };
}
