import Link from "next/link";

export default function AlmanacNotFound() {
  return (
    <main>
      <h1>No such day</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.75rem 0" }}>
        Almanac dates are YYYY-MM-DD and run 1700-01-01 to 2199-12-31 — the
        range where the ephemeris holds.
      </p>
      <Link href="/calendar">Back to the Sky Calendar</Link>
    </main>
  );
}
