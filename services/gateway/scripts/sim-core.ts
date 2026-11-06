/**
 * Simulated ESP32 core. Same protocol and checks the firmware must implement (docs/API.md §2-3):
 * verify signature/deviceId/window/nonce, switch the relay on, run a local timer, ack with an HMAC.
 * Used by `sim-device.ts` (CLI) and `demo-scenarios.ts`.
 */
import { decodeReceipt, encodeReceipt, ServerToDevice, verifyReceipt } from "@agentmeter/shared";
import { WebSocket } from "ws";
import { ackMac } from "../src/ws/mac";

export type SimMode = "normal" | "silent" | "reject" | "replay";

export interface SimOptions {
  url: string; // e.g. ws://localhost:8787
  id: string;
  token: string;
  secret: string; // per-device HMAC secret
  pub: string; // pinned receipt public key (base64)
  mode?: SimMode;
  heartbeatMs?: number;
  log?: (line: string) => void;
}

export interface SimDevice {
  ready: Promise<void>;
  relayOn(): boolean;
  setMode(mode: SimMode): void;
  /** Every receipt frame the device received (accepted or not). */
  received: Array<{ sessionId: string; nonce: string }>;
  cancelled: string[];
  closed: Promise<number>;
  close(): void;
}

const now = () => Math.floor(Date.now() / 1000);

export function startSimDevice(o: SimOptions): SimDevice {
  const log = o.log ?? (() => undefined);
  let mode: SimMode = o.mode ?? "normal";
  let relay = false;
  let offTimer: ReturnType<typeof setTimeout> | undefined;
  const used = new Set<string>(); // nonce ring buffer
  const received: SimDevice["received"] = [];
  const cancelled: string[] = [];

  const ws = new WebSocket(`${o.url}/devices/${o.id}?token=${encodeURIComponent(o.token)}`);
  const send = (v: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(v));
  let hb: ReturnType<typeof setInterval> | undefined;

  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      log(`[sim ${o.id}] connected, mode=${mode}`);
      send({ type: "hello", deviceId: o.id, fw: "sim-0.2", ts: now() });
      send({ type: "heartbeat", deviceId: o.id, relay, ts: now() });
      hb = setInterval(() => send({ type: "heartbeat", deviceId: o.id, relay, ts: now() }), o.heartbeatMs ?? 5000);
      resolve();
    });
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });

  ws.on("message", (raw) => {
    const parsed = ServerToDevice.safeParse(JSON.parse(raw.toString()));
    if (!parsed.success) return log("[sim] ignoring unknown frame");
    const m = parsed.data;

    if (m.type === "cancel") {
      relay = false;
      clearTimeout(offTimer);
      cancelled.push(m.sessionId);
      return log(`[sim] cancel ${m.sessionId} -> RELAY OFF`);
    }

    const r = m.receipt;
    received.push({ sessionId: r.sessionId, nonce: r.nonce });
    log(`[sim] receipt for ${r.sessionId} (${r.expiresAt - r.notBefore}s window)`);
    if (mode === "silent") return log("[sim] silent mode: no ack");
    if (mode === "reject") return send({ type: "nack", sessionId: r.sessionId, nonce: r.nonce, reason: "signature" });

    const out = verifyReceipt(encodeReceipt(r), m.sig, o.pub, { deviceId: o.id, now: now(), usedNonces: used });
    if (!out.ok) {
      log(`[sim] REJECT: ${out.reason}`);
      return send({ type: "nack", sessionId: r.sessionId, nonce: r.nonce, reason: out.reason });
    }
    used.add(r.nonce);
    relay = true;
    const ms = Math.max(0, (r.expiresAt - now()) * 1000);
    clearTimeout(offTimer);
    offTimer = setTimeout(() => {
      relay = false;
      log("[sim] timer expired -> RELAY OFF (no server needed)");
    }, ms);
    offTimer.unref?.();
    const ts = now();
    send({ type: "ack", sessionId: r.sessionId, nonce: r.nonce, relay: true, ts, mac: ackMac(o.secret, r.sessionId, r.nonce, ts) });
    log(`[sim] ACK sent, RELAY ON for ${Math.round(ms / 1000)}s`);

    if (mode === "replay") {
      setTimeout(() => {
        const again = verifyReceipt(encodeReceipt(decodeReceipt(encodeReceipt(r))), m.sig, o.pub, { deviceId: o.id, now: now(), usedNonces: used });
        log(`[sim] replay check -> ${again.ok ? "ACCEPTED (BUG)" : again.reason}`);
      }, 200);
    }
  });

  const closed = new Promise<number>((resolve) =>
    ws.on("close", (code) => {
      clearInterval(hb);
      clearTimeout(offTimer);
      resolve(code);
    }),
  );
  ws.on("error", (e) => log(`[sim] error: ${e.message}`));

  return {
    ready,
    relayOn: () => relay,
    setMode: (m) => (mode = m),
    received,
    cancelled,
    closed,
    close: () => ws.terminate(),
  };
}
