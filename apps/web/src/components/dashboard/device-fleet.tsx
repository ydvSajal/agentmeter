"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Fan,
  LampDesk,
  ListFilter,
  LoaderCircle,
  Search,
  Waves,
  Wind,
} from "lucide-react";
import type { DashboardData } from "@/lib/gateway";
import { money, heartbeatAge } from "@/lib/format";
import FadeContent from "../react-bits/fade-content";
export function DeviceFleet({
  data,
  loading,
  now,
}: {
  data: DashboardData | undefined;
  loading: boolean;
  now: number;
}) {
  const devices = data?.devices ?? [];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All devices");
  const [selected, setSelected] = useState<string | null>(null);
  const visible = devices.filter(
    (d) =>
      (d.name + " " + d.id).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "All devices" ||
        (filter === "Online"
          ? d.status === "ONLINE"
          : filter === "Offline"
            ? d.status === "OFFLINE"
            : d.relay)),
  );
  const focused = devices.find((d) => d.id === selected);
  return (
    <section className="device-section">
      <div className="section-heading">
        <h2>Device fleet</h2>
        <span className="muted">ESP32 / relay nodes</span>
      </div>
      <div className="tabs" role="group" aria-label="Device status filters">
        {["All devices", "Online", "In use", "Offline"].map((f) => (
          <button
            key={f}
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input
            placeholder="Search devices…"
            aria-label="Search devices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="muted">
          <ListFilter size={14} /> {visible.length} devices
        </span>
      </div>
      <div className="devices">
        {visible.map((device) => {
          const Icon =
            [Fan, LampDesk, Waves, Wind][devices.indexOf(device) % 4] ?? Cpu;
          return (
            <article
              key={device.id}
              className={`device ${selected === device.id ? "selected" : ""}`}
            >
              <div className="device-art" aria-hidden="true">
                <div className="art-grid" />
                <Icon
                  strokeWidth={0.9}
                  className={`hardware ${device.relay ? "powered" : ""}`}
                />
                <span className="node-label">{device.id}</span>
                <span className="relay-label">
                  Relay {device.relay ? "01" : "00"}
                </span>
                <div className="circuit">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="device-info">
                <div className="device-title">
                  <h3>{device.name}</h3>
                  <span
                    className={`status ${device.status === "ONLINE" ? "online" : ""}`}
                  >
                    <i />
                    {device.status === "ONLINE" ? "Online" : "Offline"}
                  </span>
                </div>
                <p>
                  {device.relay
                    ? "Relay on · paid access"
                    : device.status === "ONLINE"
                      ? "Relay off · ready for access"
                      : "Relay off · connection lost"}
                </p>
                <p className="heartbeat">
                  Heartbeat: {heartbeatAge(device.lastHeartbeat, now)}
                </p>
                <div className="device-bottom">
                  <span>
                    <b>{money(device.pricePerMinute, device.asset)}</b>
                    <small> / min</small>
                  </span>
                  <button
                    aria-label={`Inspect ${device.name}`}
                    onClick={() =>
                      setSelected(selected === device.id ? null : device.id)
                    }
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!loading && !visible.length && (
        <div className="empty">
          No devices match your filters.{" "}
          <button
            onClick={() => {
              setQuery("");
              setFilter("All devices");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {loading && !data && (
        <div className="empty">
          <LoaderCircle className="spinning" /> Loading device fleet…
        </div>
      )}
      {focused && (
        <FadeContent key={focused.id} trigger="mount" duration={0.25}>
          <div className="inspection">
            <h3>
              {focused.name} <small>{focused.id}</small>
            </h3>
            <p>
              Last heartbeat: {heartbeatAge(focused.lastHeartbeat, now)}. Relay{" "}
              {focused.relay ? "on" : "off"}.
            </p>
            <p>
              Access is requested by the payer agent through the gateway’s x402
              endpoint.
            </p>
            {data?.session?.deviceId === focused.id && (
              <Link href={`/sessions/${encodeURIComponent(data.session.id)}`}>
                View session <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </FadeContent>
      )}
    </section>
  );
}
