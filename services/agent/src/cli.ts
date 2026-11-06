/**
 * Autonomous payer (B7). Rents a device pay-per-minute over x402 on Hedera:
 * every minute it pays for one more minute, ~RENEW_LEAD_SEC before the current lease ends.
 *
 *   GATEWAY_URL=... AGENT_HEDERA_ACCOUNT_ID=0.0.x AGENT_HEDERA_PRIVATE_KEY=302e... \
 *   pnpm --filter @agentmeter/agent rent -- d1 3        # device d1, 3 minutes, paid one minute at a time
 *
 * The key is only used locally to sign; the gateway and facilitator never see it.
 */
import { PrivateKey, hederaSigner, payForMinutes, waitForSession } from "@agentmeter/chain/payer";

const RENEW_LEAD_SEC = 20;
const env = (k: string, d?: string) => {
  const v = process.env[k]?.trim() || d;
  if (!v) throw new Error(`${k} is required`);
  return v;
};

async function main() {
  const [deviceId = "d1", totalArg = "1"] = process.argv.slice(2).filter((a) => a !== "--");
  const total = Math.max(1, Number(totalArg) | 0);
  const gatewayUrl = env("GATEWAY_URL", "http://localhost:8787");
  const accountId = env("AGENT_HEDERA_ACCOUNT_ID");
  const agentId = env("AGENT_ID", "a1");
  const network = env("HEDERA_NETWORK", "testnet") as "testnet" | "mainnet";
  const signer = hederaSigner(accountId, PrivateKey.fromStringDer(env("AGENT_HEDERA_PRIVATE_KEY")), network);

  for (let i = 1; i <= total; i++) {
    const r = await payForMinutes({ gatewayUrl, deviceId, agentId, minutes: 1, signer });
    console.log(`[${i}/${total}] paid ${Number(r.amount) / 1e8} HBAR -> session ${r.sessionId} (${r.state})`);
    if (r.stepUpUrl) console.log(`  human approval needed: ${r.stepUpUrl}`);
    const s = await waitForSession(gatewayUrl, r.sessionId, r.stepUpUrl ? 300_000 : 45_000);
    const tx = s["hederaTxId"] as string | undefined;
    console.log(`  state=${s["state"]} expiresAt=${s["expiresAt"]}${tx ? ` tx=${tx} https://hashscan.io/${network}/transaction/${tx}` : ""}`);
    if (s["state"] !== "SETTLED") throw new Error(`session ended ${s["state"]}: ${JSON.stringify(s["events"] ?? s)}`);
    if (i === total) break;
    const waitSec = Number(s["expiresAt"]) - Math.floor(Date.now() / 1000) - RENEW_LEAD_SEC;
    if (waitSec > 0) {
      console.log(`  renewing in ${waitSec}s`);
      await new Promise((res) => setTimeout(res, waitSec * 1000));
    }
  }
  console.log("done: lease ends on the device timer; stop paying = device switches off");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
