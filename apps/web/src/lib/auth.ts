// Browser client for the gateway's email+password auth. Cookie is httpOnly, set by the gateway.
import { fixtureMode, gatewayUrl } from "./config";

export type AuthUser = { id: string; email: string };

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/json", ...init?.headers },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function messageOf(body: unknown, fallback: string) {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof m === "string" ? m : fallback;
}

function userOf(body: unknown): AuthUser {
  const u = (body as { user?: { id?: unknown; email?: unknown } } | null)?.user;
  if (typeof u?.id !== "string" || typeof u.email !== "string") throw new Error("Unexpected response from gateway.");
  return { id: u.id, email: u.email };
}

/** Returns the signed-in user, or null when signed out. Throws only when the gateway is unreachable. */
export async function me(): Promise<AuthUser | null> {
  if (fixtureMode) return { id: "demo", email: "demo@agentmeter.local" };
  const { status, body } = await call("/auth/me");
  return status === 401 ? null : userOf(body);
}

async function submit(path: "/auth/login" | "/auth/register", email: string, password: string) {
  if (fixtureMode) throw new Error("Demo mode has no accounts. Set NEXT_PUBLIC_FIXTURES=0 and run the gateway.");
  let result;
  try {
    result = await call(path, { method: "POST", body: JSON.stringify({ email, password }) });
  } catch {
    throw new Error("Cannot reach the gateway. Is it running?");
  }
  if (result.status >= 200 && result.status < 300) return userOf(result.body);
  throw new Error(messageOf(result.body, "Request failed. Try again."));
}

export const login = (email: string, password: string) => submit("/auth/login", email, password);
export const register = (email: string, password: string) => submit("/auth/register", email, password);

export async function logout() {
  if (!fixtureMode) await call("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
}

/** Only same-site relative paths, so `?next=` cannot bounce a user to another site. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/devices";
}
