import { describe, expect, it } from "vitest";
import { createApp, type FacilitatorCore } from "../src/app";

const core: FacilitatorCore = {
  getSupported: () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: { feePayer: "0.0.9" } }], extensions: [], signers: {} }),
  verify: async () => ({ isValid: true, payer: "0.0.5" }),
  settle: async () => {
    throw new Error("node down");
  },
};
const body = JSON.stringify({ x402Version: 2, paymentPayload: { x402Version: 2 }, paymentRequirements: { network: "hedera:testnet" } });
const post = (app: ReturnType<typeof createApp>, path: string, b: string, h: Record<string, string> = {}) =>
  app.request(path, { method: "POST", body: b, headers: { "Content-Type": "application/json", ...h } });

describe("facilitator http", () => {
  it("advertises the fee payer", async () => {
    const r = await createApp({ core }).request("/supported");
    expect((await r.json()).kinds[0].extra.feePayer).toBe("0.0.9");
  });

  it("requires the bearer key when configured", async () => {
    const app = createApp({ core, apiKey: "k".repeat(16) });
    expect((await post(app, "/verify", body)).status).toBe(401);
    const ok = await post(app, "/verify", body, { Authorization: `Bearer ${"k".repeat(16)}` });
    expect(await ok.json()).toEqual({ isValid: true, payer: "0.0.5" });
  });

  it("rejects malformed bodies and turns a thrown settle into a spec-shaped failure", async () => {
    const app = createApp({ core });
    expect((await post(app, "/settle", "{}")).status).toBe(400);
    const r = await (await post(app, "/settle", body)).json();
    expect(r).toMatchObject({ success: false, errorReason: "unexpected_settle_error", errorMessage: "node down" });
  });

  it("serves only allow-listed payees", async () => {
    const app = createApp({ core, allowPayTo: ["0.0.9"] });
    const req = (payTo: string) =>
      JSON.stringify({ x402Version: 2, paymentPayload: {}, paymentRequirements: { network: "hedera:testnet", payTo } });
    expect(await (await post(app, "/verify", req("0.0.666"))).json()).toMatchObject({ isValid: false, invalidReason: "pay_to_not_served" });
    expect(await (await post(app, "/verify", req("0.0.9"))).json()).toMatchObject({ isValid: true });
  });

  it("rate-limits account creation per IP", async () => {
    let n = 0;
    const app = createApp({ core, createAccount: async () => ({ accountId: `0.0.${++n}`, initialHbar: 3 }), accountLimits: { perIpPerHour: 2, total: 10 } });
    const pk = JSON.stringify({ publicKey: "ab".repeat(32) });
    expect((await post(app, "/accounts", pk)).status).toBe(201);
    expect((await post(app, "/accounts", pk)).status).toBe(201);
    expect((await post(app, "/accounts", pk)).status).toBe(429);
    expect((await post(app, "/accounts", pk, { "x-forwarded-for": "9.9.9.9" })).status).toBe(201);
    expect((await post(createApp({ core }), "/accounts", pk)).status).toBe(404);
  });
});
