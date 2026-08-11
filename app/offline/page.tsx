import Link from "next/link";

export const metadata = {
  title: "Offline — AstralSync",
};

// Static (no force-dynamic): precached by the service worker at install and
// shown when a never-visited route is requested while offline.
export default function OfflinePage() {
  return (
    <main style={{ textAlign: "center", padding: "6rem 1.5rem" }}>
      <p
        aria-hidden
        style={{
          fontSize: "3rem",
          color: "var(--accent-bright)",
          marginBottom: "1rem",
        }}
      >
        ✶
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--heading)",
          marginBottom: "0.75rem",
        }}
      >
        You&rsquo;re offline
      </h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "28rem", margin: "0 auto" }}>
        This page hasn&rsquo;t been loaded yet, but previously viewed profiles
        and charts are still available.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/" style={{ color: "var(--accent)" }}>
          Back to your profiles
        </Link>
      </p>
    </main>
  );
}
