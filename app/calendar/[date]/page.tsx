import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import AlmanacPanel from "@/components/calendar/AlmanacPanel";
import { isValidAlmanacDate } from "@/lib/almanacDate";

/**
 * Day almanac: the full sky story of one civil day, deep-linkable from the
 * Sky Calendar's month grid. Like /calendar this is a static shell around a
 * client component that computes everything in-browser (offline-capable);
 * only the date param is validated here. The Suspense boundary is for
 * useSearchParams (?intent=) inside the panel.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  return { title: `Sky almanac — ${date}` };
}

export default async function AlmanacPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidAlmanacDate(date)) notFound();
  return (
    <main>
      <h1>Sky almanac</h1>
      <Suspense>
        <AlmanacPanel date={date} />
      </Suspense>
    </main>
  );
}
