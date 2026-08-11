import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { timezoneFor } from "@/lib/tz";

/**
 * Offline city search (PRD §3.1, §4.3): local prefix query against the
 * imported GeoNames table, biggest cities first. Each result includes its
 * IANA timezone so onboarding can resolve the UTC offset immediately.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cities: [] });

  const cities = await prisma.geoCity.findMany({
    where: {
      OR: [{ asciiName: { startsWith: q } }, { name: { startsWith: q } }],
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
