"use client";
import { useEffect, useRef, useState } from "react";
import { DeviceEvent, SessionEvent } from "@agentmeter/shared/src/schemas";
import { fixtureMode, gatewayUrl } from "./gateway";
export function useSSE(onUpdate: () => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (fixtureMode) return;
    const source = new EventSource(`${gatewayUrl.replace(/\/$/, "")}/events`, {
      withCredentials: true,
    });
    source.onopen = () => {
      setConnected(true);
      callback.current();
    };
    source.onerror = () => setConnected(false);
    const device = (event: MessageEvent<string>) => {
      try {
        if (DeviceEvent.safeParse(JSON.parse(event.data)).success)
          callback.current();
      } catch {
        /* malformed event is ignored */
      }
    };
    const session = (event: MessageEvent<string>) => {
      try {
        if (SessionEvent.safeParse(JSON.parse(event.data)).success)
          callback.current();
      } catch {
        /* malformed event is ignored */
      }
    };
    source.addEventListener("device", device);
    source.addEventListener("session", session);
    return () => source.close();
  }, []);
  return connected;
}
