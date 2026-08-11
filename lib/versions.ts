/**
 * Version of the interpretation content library (PRD §6, `content_version`).
 * Stamped onto every astro snapshot at compute time; readings always resolve
 * against the current `content/` tree, with a provenance note shown when a
 * snapshot's stamp differs (see `resolveReading`). Bump on meaning-affecting
 * content changes — rewrites of existing entries. Adding new entries alone
 * does not require a bump. "0" marked snapshots that predate the library.
 */
export const CONTENT_VERSION = "1";
