import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
describe("approval start boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_FIXTURES", "0");
    vi.stubEnv("NEXT_PUBLIC_GATEWAY_URL", "http://gateway/");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("posts an encoded opaque session ID and returns the gateway HTTPS URL", async () => {
    const { startApproval } = await import("../src/lib/gateway");
    const fetcher = vi.fn(async () =>
      Response.json({
        authorizeUrl: "https://auth.world.org/authorize?state=bound",
      }),
    );
    expect(await startApproval("s/a?b", fetcher)).toBe(
      "https://auth.world.org/authorize?state=bound",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "http://gateway/stepup/s%2Fa%3Fb/start",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it.each([
    "http://auth.world.org/authorize",
    "javascript:alert(1)",
    "https://user:secret@auth.world.org/",
  ])("rejects insecure authorization destination %s", async (authorizeUrl) => {
    const { startApproval } = await import("../src/lib/gateway");
    await expect(
      startApproval("s", async () => Response.json({ authorizeUrl })),
    ).rejects.toThrow();
  });
  it("fails on a malformed or unsuccessful response", async () => {
    const { startApproval } = await import("../src/lib/gateway");
    await expect(
      startApproval("s", async () =>
        Response.json({ url: "https://auth.world.org" }),
      ),
    ).rejects.toThrow("Invalid approval response");
    await expect(
      startApproval("s", async () => new Response("down", { status: 503 })),
    ).rejects.toThrow("Could not start");
  });
  it("never sends a real approval request from fixture mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIXTURES", "1");
    const { startApproval } = await import("../src/lib/gateway");
    const fetcher = vi.fn();
    await expect(startApproval("s", fetcher)).rejects.toThrow("Demo mode");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
