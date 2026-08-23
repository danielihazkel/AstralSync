import { NextRequest, NextResponse } from "next/server";
import { getEntry, loadContentIndex } from "@/lib/content";
import { getCyclesView, type CyclesProse } from "@/lib/cycles";
import { transitOptionsFromQuery } from "@/lib/transits";
import { cyclesQuerySchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ephemeral cycles read: secondary progressions and the current solar return
 * vs. the profile's latest natal snapshot. Like /api/transits, never
 * persisted and never cached; `?at=<ISO instant>` pins the computation
 * instant — a testing hook, not exposed in the UI.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const parsed = cyclesQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const at = parsed.data.at ? new Date(parsed.data.at) : undefined;
  // Optional solar/lunar return relocations (Birth | Home toggles) — the
  // schema guarantees each pair arrives together.
  const srLocation =
    parsed.data.srLat !== undefined && parsed.data.srLng !== undefined
      ? { latitude: parsed.data.srLat, longitude: parsed.data.srLng }
      : undefined;
  const lrLocation =
    parsed.data.lrLat !== undefined && parsed.data.lrLng !== undefined
      ? { latitude: parsed.data.lrLat, longitude: parsed.data.lrLng }
      : undefined;
  const view = await getCyclesView(
    id,
    at,
    transitOptionsFromQuery(parsed.data),
    srLocation,
    lrLocation,
  );
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  // Per-section prose from the content library (the /api/transits pattern):
  // one fixed slot per Cycles section, absent when the input is null (solar
  // charts have no profection or progressed Ascendant) or unauthored.
  const index = loadContentIndex();
  const resolve = (key: string) => {
    const entry = getEntry(index, key);
    return entry ? { title: entry.title, bodyMd: entry.bodyMd } : undefined;
  };
  const prose: CyclesProse = {};
  if (view.profection) {
    prose.profection = resolve(
      `profection_year/${view.profection.profectedHouse}`,
    );
  }
  const progressedSun = view.progressions.placements.find(
    (p) => p.planet === "sun",
  )?.sign;
  if (progressedSun) {
    prose.progressedSun = resolve(`progressed_sun_sign/${progressedSun}`);
  }
  const progressedAsc = view.progressions.chart.bigThree?.ascendant;
  if (progressedAsc) {
    prose.progressedAsc = resolve(`progressed_asc_sign/${progressedAsc}`);
  }
  prose.solarArc = resolve("solar_arc/overview");
  prose.solarReturn = resolve("return_overview/solar");
  if (view.lunarReturn) prose.lunarReturn = resolve("return_overview/lunar");
  for (const r of view.planetaryReturns) {
    if (r.planet === "jupiter") {
      prose.jupiterReturn = resolve("return_overview/jupiter");
    } else if (r.planet === "saturn") {
      prose.saturnReturn = resolve("return_overview/saturn");
    }
  }
  return NextResponse.json({ ...view, prose }, { headers: NO_STORE });
}
