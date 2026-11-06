import Link from "next/link";
export default function NotFound() {
  return (
    <main className="session-page">
      <h1>Page not found</h1>
      <p className="muted">This page is not part of the current workspace.</p>
      <Link className="button outline" href="/devices">
        Return to device control
      </Link>
    </main>
  );
}
