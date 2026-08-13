import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rankCities, toCityResult } from "@/lib/cityResults";
import { escapeLike } from "@/lib/likeQuery";
import { timezoneFor } from "@/lib/tz";

// Far above any real city-name fragment; bounds the LIKE scan.
const MAX_QUERY_LENGTH = 64;

// Over-fetch by population so the in-process ranking has prefix and
// word-boundary matches to promote before the list is cut to size.
const DB_CANDIDATES = 50;
const MAX_RESULTS = 12;

/**
 * Offline city search (PRD §3.1, §4.3): substring query against the imported
 * GeoNames table ("york" finds "New York"), ranked prefix > word boundary >
 * substring, then population. The ~30k-row table makes an unindexed infix
 * LIKE a few milliseconds. Each result includes its IANA timezone so
 * onboarding can resolve the UTC offset immediately.
 *
 * Alternate-name matching (e.g. "Wien" for Vienna) needs the GeoNames
 * alternatenames column, which the importer currently drops — a future geo
 * re-import task, not a query change.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cities: [] });
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  }

  const needle = escapeLike(q);
  const rows = await prisma.geoCity.findMany({
    where: {
      OR: [{ asciiName: { contains: needle } }, { name: { contains: needle } }],
    },
    orderBy: { population: "desc" },
    take: DB_CANDIDATES,
  });

  return NextResponse.json({
    cities: rankCities(rows, q, MAX_RESULTS)
      .map((row) => toCityResult(row, timezoneFor))
      .filter((city) => city !== null),
  });
}
