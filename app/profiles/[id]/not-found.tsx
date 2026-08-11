import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <main>
      <h1>Profile not found</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.75rem 0" }}>
        This profile (or chart version) doesn&apos;t exist — it may have been
        deleted.
      </p>
      <Link href="/">Back to profiles</Link>
    </main>
  );
}
