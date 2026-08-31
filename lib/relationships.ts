import { prisma } from "./db";
import type { RelationshipKind } from "./relationshipMeta";

/**
 * Saved relationships — a labeled pairing of two profiles ("partner",
 * "family"…) that the synastry surfaces list and filter by. Freely editable
 * and deletable (the JournalEntry stance): a relationship is the user's own
 * annotation, never a computed artifact. The pair's cached SynastryReading
 * is independent — discarding one never touches the other.
 */

export interface RelationshipView {
  id: number;
  /** Ordered pair (aId < bId), the SynastryReading convention. */
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  kind: RelationshipKind;
  label: string | null;
  note: string | null;
  createdAt: string;
}

export interface SaveRelationshipInput {
  a: number;
  b: number;
  kind: RelationshipKind;
  label?: string;
  note?: string;
}

type Row = {
  id: number;
  aId: number;
  bId: number;
  kind: string;
  label: string | null;
  note: string | null;
  createdAt: Date;
  a: { displayName: string };
  b: { displayName: string };
};

function serialize(row: Row): RelationshipView {
  return {
    id: row.id,
    aId: row.aId,
    bId: row.bId,
    aName: row.a.displayName,
    bName: row.b.displayName,
    kind: row.kind as RelationshipKind,
    label: row.label,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

const NAMES = {
  a: { select: { displayName: true } },
  b: { select: { displayName: true } },
} as const;

/** Save (create or overwrite — one row per pair) a relationship. Null when
 *  either profile doesn't exist or is trashed (maps to 404). An empty label
 *  or note clears the field. */
export async function saveRelationship(
  input: SaveRelationshipInput,
): Promise<RelationshipView | null> {
  const [aId, bId] = input.a < input.b ? [input.a, input.b] : [input.b, input.a];
  // The soft-delete extension narrows this count to live rows.
  const live = await prisma.profile.count({ where: { id: { in: [aId, bId] } } });
  if (live !== 2) return null;
  const data = {
    kind: input.kind,
    label: input.label?.trim() ? input.label.trim() : null,
    note: input.note?.trim() ? input.note.trim() : null,
  };
  const row = await prisma.relationship.upsert({
    where: { aId_bId: { aId, bId } },
    create: { aId, bId, ...data },
    update: data,
    include: NAMES,
  });
  return serialize(row);
}

/** The saved relationship for a pair (order-insensitive), or null. */
export async function getRelationship(
  a: number,
  b: number,
): Promise<RelationshipView | null> {
  const [aId, bId] = a < b ? [a, b] : [b, a];
  const row = await prisma.relationship.findFirst({
    // Relationship rows aren't soft-deleted themselves; hide pairs whose
    // profile is in the Trash (restore brings the relationship back).
    where: { aId, bId, a: { deletedAt: null }, b: { deletedAt: null } },
    include: NAMES,
  });
  return row ? serialize(row) : null;
}

/** Every saved relationship between live profiles, newest first. */
export async function listRelationships(): Promise<RelationshipView[]> {
  const rows = await prisma.relationship.findMany({
    where: { a: { deletedAt: null }, b: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: NAMES,
  });
  return rows.map(serialize);
}

/** Remove a saved relationship. False when it doesn't exist (maps to 404). */
export async function deleteRelationship(id: number): Promise<boolean> {
  const { count } = await prisma.relationship.deleteMany({ where: { id } });
  return count > 0;
}
