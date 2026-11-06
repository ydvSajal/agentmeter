/** Composition root: env -> Hedera fee-payer signer -> x402Facilitator -> HTTP. */
import { serve } from "@hono/node-server";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
  toFacilitatorHederaSigner,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator";
import { AccountCreateTransaction, PublicKey } from "@hiero-ledger/sdk";
import { z } from "zod";
import { createApp } from "./app";

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(8791),
    HEDERA_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
    FACILITATOR_ACCOUNT_ID: z.string().regex(/^0\.0\.\d+$/),
    FACILITATOR_PRIVATE_KEY: z.string().min(64), // DER (ECDSA or ED25519)
    FACILITATOR_API_KEY: z.string().min(16).optional(),
    // Testnet drip for browser wallets. 0 disables POST /accounts.
    ACCOUNT_DRIP_HBAR: z.coerce.number().min(0).max(20).default(3),
  })
  .parse({
    ...process.env,
    // Local runs reuse the root .env operator account as fee payer.
    FACILITATOR_ACCOUNT_ID: process.env.FACILITATOR_ACCOUNT_ID ?? process.env.HEDERA_OPERATOR_ID,
    FACILITATOR_PRIVATE_KEY: (process.env.FACILITATOR_PRIVATE_KEY ?? process.env.HEDERA_OPERATOR_KEY)?.trim(),
  });

const network = `hedera:${env.HEDERA_NETWORK}` as const;
const feePayerKey = PrivateKey.fromStringDer(env.FACILITATOR_PRIVATE_KEY);

const signer = toFacilitatorHederaSigner({
  getAddresses: () => [env.FACILITATOR_ACCOUNT_ID],
  signAndSubmitTransaction: createHederaSignAndSubmitTransaction((n) => createHederaClient(n), feePayerKey),
  verifyPayerSignature: createHederaVerifyPayerSignature(),
  preflightTransfer: createHederaPreflightTransfer(),
});
const core = new x402Facilitator().register(network, new ExactHederaScheme(signer, { aliasPolicy: "reject" }));

const operatorClient = (): Client =>
  createHederaClient(network).setOperator(AccountId.fromString(env.FACILITATOR_ACCOUNT_ID), feePayerKey);

async function createAccount(publicKeyHex: string) {
  const client = operatorClient();
  try {
    const tx = await new AccountCreateTransaction()
      .setKeyWithoutAlias(PublicKey.fromString(publicKeyHex))
      .setInitialBalance(new Hbar(env.ACCOUNT_DRIP_HBAR))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    return { accountId: receipt.accountId!.toString(), initialHbar: env.ACCOUNT_DRIP_HBAR };
  } finally {
    client.close();
  }
}

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const app = createApp({
  core,
  apiKey: env.FACILITATOR_API_KEY,
  createAccount: env.HEDERA_NETWORK === "testnet" && env.ACCOUNT_DRIP_HBAR > 0 ? createAccount : undefined,
  log,
});

serve({ fetch: app.fetch, port: env.PORT }, (i) =>
  log("facilitator listening", { port: i.port, network, feePayer: env.FACILITATOR_ACCOUNT_ID, auth: Boolean(env.FACILITATOR_API_KEY) }),
);
