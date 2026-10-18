"use client";

import Link from "next/link";

/**
 * A route segment failed to render. `retry` re-fetches the segment from the
 * server before re-rendering — what a failed server read needs (`reset`
 * only re-renders what is already here). In production a server error's
 * message is a generic stand-in, so the digest is shown to match the log.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.75rem 0 1.5rem" }}>
        {error.message || "An unexpected error occurred."}
        {error.digest && <> (reference {error.digest})</>}
      </p>
      <button
        onClick={retry}
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)",
          padding: "0.5rem 1rem",
          background: "var(--surface)",
        }}
      >
        Try again
      </button>{" "}
      <Link href="/" style={{ marginLeft: "1rem" }}>
        Back to profiles
      </Link>
    </main>
  );
}
