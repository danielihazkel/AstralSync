import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import RelocationPanel from "@/components/relocation/RelocationPanel";
import { getProfileName, getProfileView } from "@/lib/snapshots";
import { toWheelChart } from "@/lib/view-types";

// The stored natal chart can change with a new version.
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = parsePositiveInt((await params).id);
  if (id === null) return {};
  const name = await getProfileName(id);
  return name ? { title: `${name} — relocation` } : {};
}

/**
 * Relocation and astrocartography: the natal chart's angles drawn across a
 * world map, and the chart recast for any chosen place. The server only
 * hands over the stored chart; lines and relocated charts compute in the
 * browser.
 */
export default async function RelocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  const view = await getProfileView(id);
  if (!view) notFound();
  const chart = toWheelChart(view.astro);

  return (
    <main>
      <p style={{ color: "var(--text-muted)" }}>
        <Link href={`/profiles/${id}`}>← {view.profile.displayName}</Link>
      </p>
      <h1>Relocation</h1>
      {chart.isSolarChart ? (
        <p>
          Relocation moves the angles and houses — and with the birth time
          unknown, those are exactly what this chart doesn&rsquo;t have. Add a
          birth time to draw the map.
        </p>
      ) : (
        <Suspense>
          <RelocationPanel profileId={id} chart={chart} />
        </Suspense>
      )}
    </main>
  );
}
