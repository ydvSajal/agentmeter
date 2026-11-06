/**
 * Browser- and Node-safe x402 payer (no node:* imports, no Buffer).
 * The key stays wherever the caller keeps it (CLI env, browser storage): this file never sends it anywhere.
 * Flow: POST /devices/:id/session -> 402 + PAYMENT-REQUIRED -> sign a partial Hedera transfer
 * (fee payer = facilitator) -> retry with PAYMENT-SIGNATURE -> 202 {sessionId}.
 */
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { AccountId, Client, Hbar, PrivateKey, TokenId, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";

export interface Signer {
  readonly accountId: string;
  createPartiallySignedTransferTransaction(r: PaymentRequirements): Promise<string>;
}

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** Same transfer as @x402/hedera's createClientHederaSigner, minus Buffer so it runs in a browser. */
export function hederaSigner(accountId: string, key: PrivateKey, network: "testnet" | "mainnet" = "testnet"): Signer {
  const payer = AccountId.fromString(accountId);
  return {
    accountId: payer.toString(),
    async createPartiallySignedTransferTransaction(r) {
      const feePayer = r.extra?.["feePayer"];
      if (typeof feePayer !== "string") throw new Error("feePayer missing in payment requirements");
      const amount = BigInt(r.amount);
      if (amount <= 0n) throw new Error("amount must be positive");
      const payTo = AccountId.fromString(r.payTo);
      const tx = new TransferTransaction();
      if (r.asset === "0.0.0") {
        tx.addHbarTransfer(payer, Hbar.fromTinybars((-amount).toString())).addHbarTransfer(payTo, Hbar.fromTinybars(amount.toString()));
      } else {
        const token = TokenId.fromString(r.asset);
        tx.addTokenTransfer(token, payer, -amount).addTokenTransfer(token, payTo, amount);
      }
      tx.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));
      const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
      try {
        tx.freezeWith(client); // only picks node ids; no network call
        return toB64((await tx.sign(key)).toBytes());
      } finally {
        client.close();
      }
    },
  };
}

export interface RentResult {
  sessionId: string;
  state: string;
  stepUpUrl?: string;
  amount: string;
}

/** Pays for `minutes` on a device and returns the created session (state PENDING/DECIDING/STEP_UP...). */
export async function payForMinutes(o: {
  gatewayUrl: string;
  deviceId: string;
  agentId: string;
  minutes: number;
  signer: Signer;
  /** Payer-side guard: refuse to sign more than this per payment (tinybar). Default 1 HBAR. */
  maxTinybarPerPayment?: bigint;
  network?: "testnet" | "mainnet";
  fetchImpl?: typeof fetch;
}): Promise<RentResult> {
  const f = o.fetchImpl ?? fetch;
  const url = `${o.gatewayUrl.replace(/\/$/, "")}/devices/${encodeURIComponent(o.deviceId)}/session`;
  const body = JSON.stringify({ minutes: o.minutes, agentId: o.agentId });
  const headers = { "Content-Type": "application/json" };

  const first = await f(url, { method: "POST", headers, body });
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}: ${await first.text()}`);
  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new Error("402 without PAYMENT-REQUIRED header");
  const required = decodePaymentRequiredHeader(header);
  const amount = required.accepts[0]?.amount ?? "0";

  const client = new x402Client()
    .register("hedera:*", new ExactHederaScheme(o.signer))
    .setSpendControls({
      maxAmountPerPayment: false, // no USD default for HBAR; the HBAR cap below applies instead
      allowedAssets: [{ network: `hedera:${o.network ?? "testnet"}`, asset: "0.0.0", maxAmountPerPayment: (o.maxTinybarPerPayment ?? 100_000_000n).toString() }],
    });
  const payload = await client.createPaymentPayload(required);

  const paid = await f(url, { method: "POST", headers: { ...headers, "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) }, body });
  const json = (await paid.json().catch(() => ({}))) as Record<string, unknown>;
  if (paid.status !== 202) {
    const err = json["error"] as { code?: string; message?: string } | undefined;
    throw new Error(`payment rejected (${paid.status}): ${err?.code ?? ""} ${err?.message ?? JSON.stringify(json)}`.trim());
  }
  return { sessionId: String(json["sessionId"]), state: String(json["state"]), stepUpUrl: json["stepUpUrl"] as string | undefined, amount };
}

/** Polls GET /sessions/:id until it leaves the in-flight states (or times out). */
export async function waitForSession(gatewayUrl: string, sessionId: string, timeoutMs = 30_000, fetchImpl: typeof fetch = fetch) {
  const end = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < end) {
    const r = await fetchImpl(`${gatewayUrl.replace(/\/$/, "")}/sessions/${sessionId}`);
    if (r.ok) {
      last = (await r.json()) as Record<string, unknown>;
      if (!["PENDING", "DECIDING", "ISSUED", "ACTIVE"].includes(String(last["state"]))) return last;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return last;
}

export { PrivateKey };
