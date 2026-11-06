/**
 * AgentMeter's own x402 facilitator (AD043). Same HTTP contract as https://x402.org/facilitator:
 *   GET /supported, POST /verify, POST /settle  ({x402Version, paymentPayload, paymentRequirements}).
 * Our Hedera operator account is the fee payer: it co-signs and submits the payer's partially
 * signed TransferTransaction. It never holds payer funds (non-custodial).
 *
 * Extra, testnet only: POST /accounts creates a Hedera account for a browser-generated public key
 * (the private key never leaves the browser) and drips a little test HBAR so a new wallet can pay.
 */
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types";

export interface FacilitatorCore {
  getSupported(): Pick<SupportedResponse, "extensions" | "signers"> & { kinds: Array<{ x402Version: number; scheme: string; network: string; extra?: Record<string, unknown> }> };
  verify(p: PaymentPayload, r: PaymentRequirements): Promise<VerifyResponse>;
  settle(p: PaymentPayload, r: PaymentRequirements): Promise<SettleResponse>;
}

export interface AppDeps {
  core: FacilitatorCore;
  /** When set, /verify and /settle need `Authorization: Bearer <key>` (stops strangers spending our fee HBAR). */
  apiKey?: string;
  /** Testnet only. Absent: POST /accounts returns 404. */
  createAccount?: (publicKey: string) => Promise<{ accountId: string; initialHbar: number }>;
  /** Accounts one client IP may create per hour, and in total per process lifetime. */
  accountLimits?: { perIpPerHour: number; total: number };
  now?: () => number; // ms
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

const Body = z.object({
  x402Version: z.number().int(),
  paymentPayload: z.record(z.unknown()),
  paymentRequirements: z.record(z.unknown()),
});
const AccountBody = z.object({ publicKey: z.string().regex(/^[0-9a-fA-F]{64,182}$/, "hex DER or raw public key") });

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createApp(d: AppDeps) {
  const app = new Hono();
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => {});
  const limits = d.accountLimits ?? { perIpPerHour: 3, total: 200 };
  // ponytail: in-memory limiter, resets on restart; fine for a testnet drip.
  const byIp = new Map<string, number[]>();
  let created = 0;

  app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST"] }));

  app.get("/health", (c) => c.json({ ok: true, service: "agentmeter-facilitator" }));
  app.get("/supported", async (c) => c.json(await d.core.getSupported()));

  const guarded = (handler: (p: PaymentPayload, r: PaymentRequirements) => Promise<unknown>, name: string) =>
    async (c: import("hono").Context) => {
      if (d.apiKey && !eq(c.req.header("Authorization") ?? "", `Bearer ${d.apiKey}`)) return c.json({ error: "unauthorized" }, 401);
      const parsed = Body.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "body must be {x402Version, paymentPayload, paymentRequirements}" }, 400);
      const p = parsed.data.paymentPayload as unknown as PaymentPayload;
      const r = parsed.data.paymentRequirements as unknown as PaymentRequirements;
      try {
        const res = await handler(p, r);
        log(name, { network: r.network, amount: r.amount, payTo: r.payTo, result: res });
        return c.json(res as object);
      } catch (e) {
        log(`${name} error`, { err: errMsg(e) });
        // Shape the failure like the spec so HTTP clients parse it instead of guessing.
        return name === "verify"
          ? c.json({ isValid: false, invalidReason: "unexpected_verify_error", invalidMessage: errMsg(e) })
          : c.json({ success: false, errorReason: "unexpected_settle_error", errorMessage: errMsg(e), transaction: "", network: r.network });
      }
    };
  app.post("/verify", guarded((p, r) => d.core.verify(p, r), "verify"));
  app.post("/settle", guarded((p, r) => d.core.settle(p, r), "settle"));

  app.post("/accounts", async (c) => {
    if (!d.createAccount) return c.json({ error: "account creation disabled" }, 404);
    const parsed = AccountBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "body must be {publicKey: hex}" }, 400);
    const ip = (c.req.header("x-forwarded-for") ?? "local").split(",")[0]!.trim();
    const t = now();
    const recent = (byIp.get(ip) ?? []).filter((x) => t - x < 3_600_000);
    if (recent.length >= limits.perIpPerHour || created >= limits.total) return c.json({ error: "rate limited" }, 429);
    byIp.set(ip, [...recent, t]);
    created++;
    try {
      const r = await d.createAccount(parsed.data.publicKey);
      log("account created", { accountId: r.accountId });
      return c.json(r, 201);
    } catch (e) {
      log("account create error", { err: errMsg(e) });
      return c.json({ error: `account create failed: ${errMsg(e)}` }, 502);
    }
  });

  return app;
}
