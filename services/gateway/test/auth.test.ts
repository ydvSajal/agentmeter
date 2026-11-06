import { describe, expect, it } from "vitest";
import type { Repos } from "@agentmeter/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createLogger } from "../src/logger";
import { hashPassword, verifyPassword } from "../src/core/password";
import type { AuthDeps } from "../src/http/auth";

const ORIGIN = "http://127.0.0.1:3000";

/** In-memory stand-in for the user/session repos plus empty read repos. */
function fakeRepos() {
  const users = new Map<string, { id: string; email: string; passwordHash: string; createdAt: number }>();
  const sessions = new Map<string, { userId: string; expiresAt: number }>();
  const repos = {
    users: {
      byEmail: async (e: string) => [...users.values()].find((u) => u.email === e.toLowerCase()) ?? null,
      byId: async (id: string) => users.get(id) ?? null,
      create: async (u: { id: string; email: string; passwordHash: string; now: number }) => {
        if ([...users.values()].some((x) => x.email === u.email.toLowerCase())) return null;
        const row = { id: u.id, email: u.email.toLowerCase(), passwordHash: u.passwordHash, createdAt: u.now };
        users.set(u.id, row);
        return row;
      },
    },
    authSessions: {
      create: async (s: { tokenHash: string; userId: string; now: number; ttlSec: number }) => {
        sessions.set(s.tokenHash, { userId: s.userId, expiresAt: s.now + s.ttlSec });
      },
      userFor: async (h: string, now: number) => {
        const s = sessions.get(h);
        return s && s.expiresAt > now ? (users.get(s.userId) ?? null) : null;
      },
      delete: async (h: string) => void sessions.delete(h),
      purgeExpired: async () => ({ count: 0 }),
    },
    devices: { list: async () => [] },
    agents: { list: async () => [], spentOn: () => 0n },
    sessions: { list: async () => [], get: async () => null },
  };
  return repos as unknown as Repos;
}

function build(over: Partial<AuthDeps> = {}) {
  const repos = fakeRepos();
  let t = 1_800_000_000;
  const auth: AuthDeps = {
    repos,
    now: () => t,
    allowedOrigins: [ORIGIN],
    allowRegistration: true,
    secureCookie: false,
    sameSite: "Lax",
    ttlSec: 3600,
    ...over,
  };
  const app = createApp({
    log: createLogger("silent"),
    adapters: loadConfig({}).adapters,
    startedAt: 0,
    now: () => t,
    auth,
  });
  // Stand-ins for the real read routes (mounted via `api` in production): requireAuth runs before them.
  app.get("/devices", (c) => c.json([]));
  app.get("/events", (c) => c.text("ok"));
  return { app, advance: (s: number) => (t += s) };
}

const post = (app: ReturnType<typeof build>["app"], path: string, body: unknown, cookie?: string, origin = ORIGIN) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const creds = { email: "Alice@Example.com", password: "correct horse battery" };

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("hunter2-hunter2");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("hunter2-hunter2", h)).toBe(true);
    expect(await verifyPassword("hunter2-hunter3", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("auth routes", () => {
  it("register sets an httpOnly cookie and /me returns the user", async () => {
    const { app } = build();
    const res = await post(app, "/auth/register", creds);
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    const me = await app.request("/auth/me", { headers: { cookie: cookieOf(res) } });
    expect(await me.json()).toMatchObject({ user: { email: "alice@example.com" } });
  });

  it("rejects duplicate email, weak password, bad email", async () => {
    const { app } = build();
    await post(app, "/auth/register", creds);
    expect((await post(app, "/auth/register", { ...creds, email: "alice@example.com" })).status).toBe(409);
    expect((await post(app, "/auth/register", { email: "b@example.com", password: "short" })).status).toBe(400);
    expect((await post(app, "/auth/register", { email: "nope", password: "long enough password" })).status).toBe(400);
  });

  it("login works and wrong password / unknown email give the same 401", async () => {
    const { app } = build();
    await post(app, "/auth/register", creds);
    expect((await post(app, "/auth/login", creds)).status).toBe(200);
    const bad = await post(app, "/auth/login", { ...creds, password: "wrong wrong wrong" });
    const unknown = await post(app, "/auth/login", { email: "ghost@example.com", password: "whatever whatever" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
  });

  it("locks out after repeated failures", async () => {
    const { app } = build();
    await post(app, "/auth/register", creds);
    for (let i = 0; i < 8; i++) await post(app, "/auth/login", { ...creds, password: "wrong wrong wrong" });
    expect((await post(app, "/auth/login", creds)).status).toBe(429);
  });

  it("logout invalidates the session", async () => {
    const { app } = build();
    const cookie = cookieOf(await post(app, "/auth/register", creds));
    await post(app, "/auth/logout", {}, cookie);
    expect((await app.request("/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("session expires after the ttl", async () => {
    const { app, advance } = build();
    const cookie = cookieOf(await post(app, "/auth/register", creds));
    advance(3601);
    expect((await app.request("/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("registration can be closed", async () => {
    const { app } = build({ allowRegistration: false });
    expect((await post(app, "/auth/register", creds)).status).toBe(403);
  });

  it("rejects a POST from a foreign origin", async () => {
    const { app } = build();
    expect((await post(app, "/auth/login", creds, undefined, "https://evil.example")).status).toBe(403);
  });
});

describe("protected reads", () => {
  it.each(["/devices", "/agents", "/audit", "/notifications", "/events"])("%s needs a login", async (path) => {
    const { app } = build();
    expect((await app.request(path)).status).toBe(401);
  });

  it("serves reads with a valid cookie and echoes the allowed origin for CORS credentials", async () => {
    const { app } = build();
    const cookie = cookieOf(await post(app, "/auth/register", creds));
    const res = await app.request("/devices", { headers: { cookie, origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("leaves /sessions/:id and /health open (agents poll sessions)", async () => {
    const { app } = build();
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/sessions/nope")).status).not.toBe(401);
  });

  it("does not grant CORS to an unknown origin", async () => {
    const { app } = build();
    const res = await app.request("/health", { headers: { origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
