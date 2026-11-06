/** Resend email adapter (AD035). Implements the shared Notifier port: timeout, typed error, never a fake success. */
import { AgentMeterError, withTimeout, type NotificationMessage, type Notifier } from "@agentmeter/shared";

export interface ResendOptions {
  apiKey: string;
  from: string;
  to: string;
  timeoutMs: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export class ResendNotifier implements Notifier {
  constructor(private readonly o: ResendOptions) {}

  async send(msg: NotificationMessage): Promise<{ id: string }> {
    const f = this.o.fetchImpl ?? fetch;
    try {
      return await withTimeout(
        async (signal) => {
          const res = await f(`${this.o.baseUrl ?? "https://api.resend.com"}/emails`, {
            method: "POST",
            signal,
            headers: {
              Authorization: `Bearer ${this.o.apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": msg.idempotencyKey,
            },
            body: JSON.stringify({
              from: this.o.from,
              to: [this.o.to],
              subject: msg.subject,
              text: msg.text,
              ...(msg.html ? { html: msg.html } : {}),
            }),
          });
          const body = (await res.json().catch(() => ({}))) as { id?: unknown; message?: unknown };
          if (!res.ok || typeof body.id !== "string") {
            // Resend error bodies do not echo the API key; we never log or return it.
            throw new AgentMeterError("INTERNAL", `resend ${res.status}: ${typeof body.message === "string" ? body.message : "no id in response"}`);
          }
          return { id: body.id };
        },
        this.o.timeoutMs,
        "resend send",
      );
    } catch (e) {
      if (e instanceof AgentMeterError) throw e;
      throw new AgentMeterError("INTERNAL", `resend request failed: ${e instanceof Error ? e.message : String(e)}`, undefined, { cause: e });
    }
  }
}
