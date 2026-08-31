import type { Metadata } from "next";
import Link from "next/link";
import { getGroupSynastry, type GroupPairSummary } from "@/lib/synastry";
import { listRelationships } from "@/lib/relationships";
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_LABELS,
  type RelationshipKind,
} from "@/lib/relationshipMeta";
import { ASPECT_NAMES, PLANET_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import styles from "@/components/synastry/synastry.module.css";

export const metadata: Metadata = {
  title: "Group synastry",
  description: "Every pair of saved charts at a glance.",
};

// Snapshot data lives in the local DB; render per-request.
export const dynamic = "force-dynamic";

function StrongestCell({ pair }: { pair: GroupPairSummary }) {
  if (!pair.strongest) {
    return <span className={styles.muted}>no contacts in orb</span>;
  }
  const s = pair.strongest;
  return (
    <>
      <span className={styles.glyph} aria-hidden="true">
        {PLANET_GLYPH_CHARS[s.a] + "︎"}
      </span>
      {PLANET_NAMES[s.a]} {ASPECT_NAMES[s.type].toLowerCase()}{" "}
      <span className={styles.glyph} aria-hidden="true">
        {PLANET_GLYPH_CHARS[s.b] + "︎"}
      </span>
      {PLANET_NAMES[s.b]}
      <span className={styles.orb}> {s.orb.toFixed(1)}°</span>
      <br />
      <span className={styles.muted}>
        {pair.count} contact{pair.count === 1 ? "" : "s"}
      </span>
    </>
  );
}

/**
 * The group grid: every unordered pair of saved charts, summarized as its
 * contact count and single tightest cross aspect (natal orbs). Deliberately
 * not a compatibility score — the doctrine for ranking whole relationships
 * is contested, so the grid shows the raw structure and links each cell to
 * the full pair page.
 */
export default async function GroupSynastryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: rawKind } = await searchParams;
  const kind = (RELATIONSHIP_KINDS as readonly string[]).includes(rawKind ?? "")
    ? (rawKind as RelationshipKind)
    : null;
  const [group, relationships] = await Promise.all([
    getGroupSynastry(),
    listRelationships(),
  ]);
  const { profiles, pairs } = group;
  const byPair = new Map(pairs.map((p) => [`${p.aId}|${p.bId}`, p]));
  const pairOf = (x: number, y: number) =>
    byPair.get(`${x}|${y}`) ?? byPair.get(`${y}|${x}`) ?? null;
  const relByPair = new Map(relationships.map((r) => [`${r.aId}|${r.bId}`, r]));
  const relOf = (x: number, y: number) =>
    relByPair.get(`${x}|${y}`) ?? relByPair.get(`${y}|${x}`) ?? null;
  // ?kind= narrows the grid to profiles in a relationship of that kind and
  // the pair list to exactly those pairs.
  const kindIds = kind
    ? new Set(
        relationships
          .filter((r) => r.kind === kind)
          .flatMap((r) => [r.aId, r.bId]),
      )
    : null;
  const gridProfiles = kindIds
    ? profiles.filter((p) => kindIds.has(p.id))
    : profiles;
  const shownPairs = kind
    ? pairs.filter((p) => relOf(p.aId, p.bId)?.kind === kind)
    : pairs;
  const presentKinds = RELATIONSHIP_KINDS.filter((k) =>
    relationships.some((r) => r.kind === k),
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Group synastry</h1>
      </header>

      {profiles.length < 3 ? (
        <p className={styles.muted}>
          The group grid needs at least three charts —{" "}
          {profiles.length === 2 ? (
            <>
              with two, use the{" "}
              <Link
                href={`/synastry?a=${profiles[0].id}&b=${profiles[1].id}`}
              >
                pair page
              </Link>
              .
            </>
          ) : (
            <>
              <Link href="/onboarding">create more charts</Link> to compare.
            </>
          )}
        </p>
      ) : (
        <>
          <p className={styles.muted}>
            Each cell holds a pair&rsquo;s tightest cross aspect and how many
            contacts sit within natal orbs — click through for the full
            comparison. Deliberately not a score: the grid shows structure,
            not a verdict.
          </p>
          {presentKinds.length > 0 && (
            <p className={styles.muted}>
              Filter by relationship:{" "}
              {kind === null ? (
                <strong>All</strong>
              ) : (
                <Link href="/synastry/group">All</Link>
              )}
              {presentKinds.map((k) => (
                <span key={k}>
                  {" · "}
                  {kind === k ? (
                    <strong>{RELATIONSHIP_KIND_LABELS[k]}</strong>
                  ) : (
                    <Link href={`/synastry/group?kind=${k}`}>
                      {RELATIONSHIP_KIND_LABELS[k]}
                    </Link>
                  )}
                </span>
              ))}
            </p>
          )}
          <div className="tableWrap">
            <table className={styles.table} aria-label="Pairwise synastry">
              <thead>
                <tr>
                  <th scope="col" aria-label="Profile" />
                  {gridProfiles.map((p) => (
                    <th key={p.id} scope="col">
                      {p.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridProfiles.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.displayName}</th>
                    {gridProfiles.map((col) => {
                      if (row.id === col.id) {
                        return <td key={col.id}>—</td>;
                      }
                      const pair = pairOf(row.id, col.id);
                      if (!pair) return <td key={col.id}>—</td>;
                      return (
                        <td key={col.id}>
                          <Link
                            className={styles.cellLink}
                            href={`/synastry?a=${row.id}&b=${col.id}`}
                          >
                            <StrongestCell pair={pair} />
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section aria-label="Pairs by contact count">
            <h2 className={styles.sectionTitle}>Most contact first</h2>
            <ul className={styles.aspectList}>
              {[...shownPairs]
                .sort((x, y) => y.count - x.count)
                .map((pair) => {
                  const a = profiles.find((p) => p.id === pair.aId)!;
                  const b = profiles.find((p) => p.id === pair.bId)!;
                  return (
                    <li key={`${pair.aId}-${pair.bId}`}>
                      <Link href={`/synastry?a=${pair.aId}&b=${pair.bId}`}>
                        {a.displayName} × {b.displayName}
                      </Link>{" "}
                      · {pair.count} contact{pair.count === 1 ? "" : "s"}
                      {relOf(pair.aId, pair.bId) && (
                        <span className={styles.tag}>
                          {" "}
                          {
                            RELATIONSHIP_KIND_LABELS[
                              relOf(pair.aId, pair.bId)!.kind
                            ]
                          }
                        </span>
                      )}
                      {pair.strongest && (
                        <span className={styles.muted}>
                          {" "}
                          · tightest: {PLANET_NAMES[pair.strongest.a]}{" "}
                          {ASPECT_NAMES[pair.strongest.type].toLowerCase()}{" "}
                          {PLANET_NAMES[pair.strongest.b]} (
                          {pair.strongest.orb.toFixed(1)}°)
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}

      <p className={styles.muted}>
        <Link href="/synastry">← Synastry</Link> ·{" "}
        <Link href="/">All profiles</Link>
      </p>
    </main>
  );
}
