"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/** Coalesces event bursts, queues the latest read, ignores superseded routes. */
export function useResource<T>(loader: (previous?: T) => Promise<T>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const last = useRef<T | undefined>(undefined);
  const generation = useRef(0),
    running = useRef(false),
    queued = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) {
      queued.current = true;
      return;
    }
    const active = generation.current;
    running.current = true;
    setLoading(true);
    do {
      queued.current = false;
      try {
        const next = await loader(last.current);
        if (active !== generation.current) break;
        last.current = next;
        setData(next);
        setError("");
        setUpdated(new Date());
      } catch (failure) {
        if (active !== generation.current) break;
        setError(
          failure instanceof Error
            ? failure.message
            : "Request failed. Try again.",
        );
      }
    } while (queued.current && active === generation.current);
    if (active === generation.current) {
      running.current = false;
      setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    generation.current += 1;
    running.current = false;
    queued.current = false;
    last.current = undefined;
    setData(undefined);
    setError("");
    setUpdated(null);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      generation.current += 1;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  return { data, loading, error, updated, refresh };
}
