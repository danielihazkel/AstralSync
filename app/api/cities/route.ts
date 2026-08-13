import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { escapeLikePrefix } from "@/lib/likeQuery";
import { timezoneFor } from "@/lib/tz";

// Far above any real city-name prefix; bounds the LIKE scan.
const MAX_QUERY_LENGTH = 64;

/**
 * Offline city search (PRD §3.1, §4.3): local prefix query against the
 * imported GeoNames table, biggest cities first. Each result includes its
 * IANA timezone so onboarding can resolve the UTC offset immediately.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cities: [] });
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  }

  const prefix = escapeLikePrefix(q);
  const cities = await prisma.geoCity.findMany({
    where: {
      OR: [{ asciiName: { startsWith: prefix } }, { name: { startsWith: prefix } }],
    },
    orderBy: { population: "desc" },
    take: 12,
  });

  return NextResponse.json({
    cities: cities.map((c) => ({
      geonameId: c.geonameId,
      name: c.name,
      countryCode: c.countryCode,
      admin1: c.admin1,
      lat: c.lat,
      lng: c.lng,
      tzIana: timezoneFor(c.lat, c.lng),
    })),
  });
}
