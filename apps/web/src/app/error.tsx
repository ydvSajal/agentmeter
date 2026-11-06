"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="session-page">
      <h1>Couldn’t open this view</h1>
      <p className="muted">
        The interface could not finish rendering. Retry to load the current
        gateway state.
      </p>
      <div className="approval-actions">
        <Button onClick={reset}>Retry</Button>
        <Link className="button outline" href="/devices">
          Device control
        </Link>
      </div>
    </main>
  );
}
