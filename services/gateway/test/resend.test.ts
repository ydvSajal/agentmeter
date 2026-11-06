import { describe, expect, it } from "vitest";
import { ResendNotifier } from "../src/adapters/resend";
import { loadConfig } from "../src/config";
import { buildPorts } from "../src/ports";

const msg = { kind: "SAFE_STOP" as const, sessionId: "s1", idempotencyKey: "SAFE_STOP:s1", subject: "sub", text: "body" };
const make = (fetchImpl: typeof fetch, timeoutMs = 1000) =>
  new ResendNotifier({ apiKey: "re_test_key", from: "a@b.c", to: "owner@example.com", timeoutMs, fetchImpl });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("ResendNotifier", () => {
  it("posts the email with auth and idempotency headers and returns the provider id", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const n = make(async (url, init) => {
      seen = { url: String(url), init: init! };
      return json(200, { id: "em_123" });
    });
    expect(await n.send(msg)).toEqual({ id: "em_123" });
    expect(seen!.url).toBe("https://api.resend.com/emails");
    const h = seen!.init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer re_test_key");
    expect(h["Idempotency-Key"]).toBe("SAFE_STOP:s1");
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({ from: "a@b.c", to: ["owner@example.com"], subject: "sub", text: "body" });
  });

  it("throws INTERNAL on a provider error and never leaks the key", async () => {
    const n = make(async () => json(403, { message: "domain not verified" }));
    const err = await n.send(msg).catch((e: unknown) => e as Error & { code: string });
    expect(err).toMatchObject({ code: "INTERNAL" });
    expect((err as Error).message).toContain("403");
    expect((err as Error).message).not.toContain("re_test_key");
  });

  it("throws when the response has no id (no made-up success)", async () => {
    const n = make(async () => json(200, {}));
    await expect(n.send(msg)).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("times out", async () => {
    const n = make((_u, init) => new Promise((_r, rej) => init!.signal!.addEventListener("abort", () => rej(new Error("aborted")))), 30);
    await expect(n.send(msg)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("network failure becomes INTERNAL", async () => {
    const n = make(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(n.send(msg)).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("notify config", () => {
  it("is off by default and requires key + recipient when enabled", () => {
    expect(buildPorts(loadConfig({})).notifier).toBeUndefined();
    expect(() => loadConfig({ NOTIFY_ENABLED: "true" })).toThrow(/RESEND_API_KEY.*NOTIFY_TO/);
    const p = buildPorts(loadConfig({ NOTIFY_ENABLED: "true", RESEND_API_KEY: "k", NOTIFY_TO: "o@example.com" }));
    expect(p.notifier).toBeInstanceOf(ResendNotifier);
  });
});
