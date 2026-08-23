import type { Metadata } from "next";
import Link from "next/link";
import { listAllJournalEntries } from "@/lib/journal";
import JournalTimeline from "@/components/journal/JournalTimeline";

export const metadata: Metadata = {
  title: "Journal",
  description: "Every profile's notes in one chronological stream.",
};

// Journal entries live in the local DB and change between requests.
export const dynamic = "force-dynamic";

/** The cross-profile journal timeline: server-loaded once, filtered
 *  client-side (text, mood, tag, profile). Writing stays on each profile's
 *  Journal tab. */
export default async function JournalPage() {
  const entries = await listAllJournalEntries();
  return (
    <main>
      <h1>Journal</h1>
      <JournalTimeline entries={entries} />
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">← All profiles</Link>
      </p>
    </main>
  );
}
