"use client";
import { useState } from "react";
import { money } from "@/lib/format";
const stages = [
  {
    name: "Request",
    title: "Choose the minutes.",
    detail:
      "An agent requests a device for a fixed duration. The gateway returns the x402 payment requirements.",
    state: "PENDING",
    outcome: "Relay stays off",
  },
  {
    name: "Decide",
    title: "Check before access.",
    detail:
      "The gateway checks spending policy, requests human approval when needed, and asks 0G for a decision.",
    state: "DECIDING",
    outcome: "Relay stays off",
  },
  {
    name: "Verify",
    title: "A receipt, then a relay.",
    detail:
      "The device verifies the signed, expiring receipt and acknowledges it before the gateway settles payment.",
    state: "ISSUED",
    outcome: "Awaiting device acknowledgment",
  },
  {
    name: "Access",
    title: "Only the time paid for.",
    detail:
      "The receipt expires locally on the device. A failed required check stops access safely.",
    state: "ACTIVE",
    outcome: "Relay on until receipt expiry",
  },
];
export function ReceiptPlayground() {
  const [stage, setStage] = useState(0),
    [minutes, setMinutes] = useState(10);
  const current = stages[stage]!;
  return (
    <div className="receipt-playground">
      <div
        className="stage-controls"
        role="group"
        aria-label="Access flow stages"
      >
        {stages.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={stage === index}
            onClick={() => setStage(index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="stage-layout">
        <div className="stage-explanation" aria-live="polite">
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
          <a href="/docs/api">Read the wire contract</a>
        </div>
        <div className="receipt-demo" data-ui>
          <div className="receipt-demo-head">
            <span>Workshop fan</span>
            <span>{current.state}</span>
          </div>
          <div className="receipt-amount">
            {money((BigInt(minutes) * 1000000n).toString(), "HBAR")}
          </div>
          <label htmlFor="demo-minutes">
            Duration <strong>{minutes} minutes</strong>
          </label>
          <input
            id="demo-minutes"
            aria-describedby="demo-rate"
            type="range"
            min="1"
            max="30"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
          <p id="demo-rate">0.01 HBAR / minute · illustrative rate</p>
          <div
            className={`relay-preview ${stage === 3 ? "relay-preview-on" : ""}`}
          >
            <span className="relay-contact" aria-hidden="true">
              <i />
              <b />
              <i />
            </span>
            <span>{current.outcome}</span>
          </div>
          <p className="simulation-note">
            Interactive explanation. No payment or device action.
          </p>
        </div>
      </div>
    </div>
  );
}
