"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout, me } from "@/lib/auth";
import { fixtureMode } from "@/lib/config";

/** Topbar account chip with sign out. In demo (fixture) mode there is no account, so it stays a plain avatar. */
export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!fixtureMode) me().then((u) => setEmail(u?.email ?? null)).catch(() => undefined);
  }, []);
  if (fixtureMode) return <span className="top-avatar">S</span>;
  return (
    <span className="user-menu">
      <span className="top-avatar" title={email ?? ""}>
        {email ? email[0]?.toUpperCase() : "?"}
      </span>
      <button
        type="button"
        className="user-signout"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        Sign out
      </button>
    </span>
  );
}
