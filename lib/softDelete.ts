/**
 * Soft-delete filter for the Prisma client extension in lib/db.ts. Pure so
 * node-env tests cover it without a database.
 *
 * Models with a nullable `deletedAt` column are "trashed" rather than
 * removed: every ordinary read/update/delete is narrowed to live rows
 * (`deletedAt: null`) unless the caller names `deletedAt` in its own `where`
 * — the Trash surfaces do exactly that to list, restore or purge rows.
 */

export const SOFT_DELETE_MODELS = new Set(["Profile", "JournalEntry"]);

/** Operations whose `where` is narrowed. Creates are untouched (a new row
 *  is live by definition); aggregates and groupBy aren't used on these
 *  models. `upsert` is excluded deliberately — its unique `where` cannot
 *  carry the filter and nothing upserts a profile or journal entry. */
export const SOFT_DELETE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

/** Add `deletedAt: null` to `args.where` unless the caller already filters on
 *  `deletedAt` (explicit trash access). Never mutates the input. */
export function withLiveFilter<
  T extends { where?: Record<string, unknown> | undefined } & Record<string, unknown>,
>(args: T | undefined): T {
  const base = (args ?? {}) as T;
  const where = base.where ?? {};
  if (Object.prototype.hasOwnProperty.call(where, "deletedAt")) return base;
  return { ...base, where: { ...where, deletedAt: null } };
}

export function shouldFilter(model: string, operation: string): boolean {
  return SOFT_DELETE_MODELS.has(model) && SOFT_DELETE_OPERATIONS.has(operation);
}

/** Models owned by a profile that the ephemeral reads (transits, cycles,
 *  search, calendar, forecasts) look up directly by `profileId` — they must
 *  not see a trashed profile's snapshots either. Reads only: these are
 *  write-once models, and the profile purge cascades through the DB. */
export const PROFILE_OWNED_MODELS = new Set([
  "AstroSnapshot",
  "NumeroSnapshot",
  "HebrewSnapshot",
  "JournalEntry",
]);

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
]);

export function shouldFilterViaProfile(model: string, operation: string): boolean {
  return PROFILE_OWNED_MODELS.has(model) && READ_OPERATIONS.has(operation);
}

/** Add `profile: { deletedAt: null }` unless the caller already filters on
 *  the profile relation. Never mutates the input. */
export function withLiveProfileFilter<
  T extends { where?: Record<string, unknown> | undefined } & Record<string, unknown>,
>(args: T | undefined): T {
  const base = (args ?? {}) as T;
  const where = base.where ?? {};
  if (Object.prototype.hasOwnProperty.call(where, "profile")) return base;
  return { ...base, where: { ...where, profile: { deletedAt: null } } };
}
