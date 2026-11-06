"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { me } from "@/lib/auth";

/** Renders children only for a signed-in user; otherwise sends the visitor to /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    let live = true;
    me()
      .then((user) => {
        if (!live) return;
        if (user) setState("ok");
        else router.replace(`/login?next=${encodeURIComponent(path)}`);
      })
      .catch(() => live && setState("down"));
    return () => {
      live = false;
    };
  }, [path, router]);

  if (state === "ok") return <>{children}</>;
  return (
    <p className="auth-status" role="status">
      {state === "down" ? "Cannot reach the gateway. Start it and refresh." : "Checking your session…"}
    </p>
  );
}
