import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timezoneFor } from "@/lib/tz";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * IANA timezone for arbitrary coordinates — the manual-location onboarding
 * path's counterpart to the city search's per-city zone. 404 `no_timezone`
 * for coordinates outside every zone polygon (open ocean); the client then
 * asks the user to pick a zone themselves.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: req.nextUrl.searchParams.get("lat"),
    lng: req.nextUrl.searchParams.get("lng"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_coords" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      tzIana: timezoneFor(parsed.data.lat, parsed.data.lng),
    });
  } catch {
    return NextResponse.json({ error: "no_timezone" }, { status: 404 });
  }
}
