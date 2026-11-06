"use client";
import { useState } from "react";
const screens = [
  {
    title: "Devices",
    image: "fleet",
    description:
      "Device fleet with relay state, heartbeat and price per minute.",
  },
  {
    title: "Agents",
    image: "agents",
    description: "Agent budgets, exact spend and remaining daily allowance.",
  },
  {
    title: "Audit",
    image: "audit",
    description:
      "Session outcomes and verification evidence in one audit trail.",
  },
];
export function HeroFolders() {
  const [active, setActive] = useState(0);
  return (
    <div className="hero-folders">
      <div
        className="folder-tabs"
        role="group"
        aria-label="Preview dashboard screens"
      >
        {screens.map((screen, index) => (
          <button
            key={screen.title}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
          >
            {screen.title}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div className="folder-screen" data-ui>
        <div className="folder-screen-caption">
          <span>AgentMeter / {screens[active]!.title}</span>
          <span>Demo workspace</span>
        </div>
        <img
          key={screens[active]!.image}
          src={`/media/${screens[active]!.image}.jpg`}
          alt={screens[active]!.description}
          width={1440}
          height={900}
          fetchPriority="high"
        />
        <a
          href={active === 0 ? "/devices" : active === 1 ? "/agents" : "/audit"}
        >
          Explore this screen <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
