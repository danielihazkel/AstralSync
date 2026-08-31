/**
 * Relationship kind vocabulary — the canonical union, client-safe (the
 * lib/journalMeta.ts stance): pure and dependency-free so client components
 * import it statically; lib/relationships.ts casts Prisma's generated enum
 * to this union at the store boundary. Keep RELATIONSHIP_KINDS in sync with
 * the RelationshipKind enum in prisma/schema.prisma.
 */

export const RELATIONSHIP_KINDS = [
  "partner",
  "family",
  "friend",
  "colleague",
  "other",
] as const;

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const RELATIONSHIP_KIND_LABELS: Record<RelationshipKind, string> = {
  partner: "Partner",
  family: "Family",
  friend: "Friend",
  colleague: "Colleague",
  other: "Other",
};

export const MAX_RELATIONSHIP_LABEL = 80;
export const MAX_RELATIONSHIP_NOTE = 400;
