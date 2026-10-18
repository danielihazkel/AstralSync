import Link from "next/link";

export const metadata = { title: "Not found" };

/** Any URL no route matches — inside the site's own frame, not Next's
 *  unstyled default. */
export default function NotFound() {
  return (
    <main>
      <h1>Nothing here</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.75rem 0" }}>
        That page doesn&rsquo;t exist. Ctrl+K opens the command palette — every
        page and profile is one search away.
      </p>
      <p>
        <Link href="/">Back to profiles</Link> · <Link href="/chart">Sky now</Link> ·{" "}
        <Link href="/calendar">Calendar</Link>
      </p>
    </main>
  );
}
