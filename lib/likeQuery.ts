/**
 * Prisma does not escape LIKE wildcards in `startsWith`/`contains` for MySQL
 * (verified empirically: `startsWith: "Te%"` matches everything `"Te"` does,
 * and `"T_"` matches any third character). Escape them with a backslash —
 * MySQL's default ESCAPE character — before building a prefix query.
 */
export function escapeLikePrefix(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}
