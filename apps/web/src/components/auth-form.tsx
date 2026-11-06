"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { login, register, safeNext } from "@/lib/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await (isLogin ? login : register)(email, password);
      router.replace(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed. Try again.");
      setBusy(false);
    }
  }

  const other = isLogin ? "/register" : "/login";
  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <Link className="auth-brand" href="/">
          agentmeter.
        </Link>
        <h1>{isLogin ? "Sign in" : "Create account"}</h1>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!isLogin && <small>At least 10 characters.</small>}
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
        <p className="auth-switch">
          {isLogin ? "No account yet? " : "Already registered? "}
          <Link href={next === "/devices" ? other : `${other}?next=${encodeURIComponent(next)}`}>
            {isLogin ? "Create one" : "Sign in"}
          </Link>
        </p>
      </form>
    </main>
  );
}
