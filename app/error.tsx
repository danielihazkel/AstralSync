"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.75rem 0 1.5rem" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)",
          padding: "0.5rem 1rem",
          background: "var(--surface)",
        }}
      >
        Try again
      </button>
    </main>
  );
}
