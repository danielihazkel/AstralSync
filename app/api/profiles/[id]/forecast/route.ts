import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  contentRoot,
  getEntry,
  loadContentIndex,
  natalAspectKey,
  transitAspectKey,
  type ContentEntry,
} from "@/lib/content";
import {
  civilFromDate,
  computeHebrewPeriodSummary,
  computeWesternPeriodSummary,
  periodFor,
  type AspectWindow,
  type CivilDate,
} from "@/lib/forecast";
import {
  createForecast,
  deleteForecast,
  getForecast,
  getLatestNatal,
  type StoredForecast,
} from "@/lib/forecastStore";
import { listLifeEvents } from "@/lib/lifeEvents";
import {
  buildHebrewForecastPrompt,
  buildWesternForecastPrompt,
  llmClientFromEnv,
  LlmUnavailableError,
  type ForecastAspectContext,
} from "@/lib/llm";
import { birthDataFromProfile } from "@/lib/promptData";
import { ensureHebrewSnapshot, getProfileView } from "@/lib/snapshots";
import { streamGenerationResponse } from "@/lib/streamGeneration";
import { forecastParamsSchema, type ForecastParams } from "@/lib/validation";
import {
  toNumeroDerivation,
  toStoredHebrewGematria,
  toStoredMazal,
  toWheelChart,
} from "@/lib/view-types";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * AI period forecasts (western transits / Hebrew calendar vs. the natal
 * charts), cached per (profile, mode, kind, periodStart). Periods are keyed
 * by server-local civil dates; forecasts always run against the LATEST
 * snapshot version (the transits stance), and a stored row remembers which
 * version via natalVersion — staleness is surfaced, never auto-invalidated.
 */

function civilFromParam(date: string | undefined): CivilDate {
  if (!date) return civilFromDate(new Date());
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function serializeForecast(f: StoredForecast) {
  return {
    bodyMd: f.bodyMd,
    modelName: f.modelName,
    contentVersion: f.contentVersion,
    createdAt: f.createdAt,
    natalVersion: f.natalVersion,
  };
}

async function parseParams(
  req: NextRequest,
  source: "query" | "body",
): Promise<ForecastParams | NextResponse> {
  const raw =
    source === "query"
      ? Object.fromEntries(req.nextUrl.searchParams)
      : await req.json().catch(() => ({}));
  const parsed = forecastParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  return parsed.data;
}

/** GET ?mode=&kind=&date?= → the stored forecast for that period, or null. */
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
  const parsed = await parseParams(req, "query");
  if (parsed instanceof NextResponse) return parsed;

  const natal = await getLatestNatal(id);
  if (!natal) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }

  const period = periodFor(parsed.kind, parsed.mode, civilFromParam(parsed.date));
  const forecast = await getForecast(id, parsed.mode, parsed.kind, period.start);
  return NextResponse.json(
    {
      period,
      natalVersion: natal.version,
      forecast: forecast ? serializeForecast(forecast) : null,
    },
    { headers: NO_STORE },
  );
}

/**
 * Entries for the strongest transiting pairs, deduped, missing keys skipped.
 * Authored `transit_aspect` prose (directional: `w.a` is the transiting
 * body) wins; unauthored pairs fall back to the natal `aspect` archetype the
 * prompt is told to adapt.
 */
function westernEntries(windows: AspectWindow[]): ForecastAspectContext {
  const index = loadContentIndex();
  const seen = new Set<string>();
  const context: ForecastAspectContext = { transit: [], natalArchetypes: [] };
  for (const w of windows) {
    const transitKey = transitAspectKey(w.a, w.b, w.type);
    const natalKey = natalAspectKey(w.a, w.b, w.type);
    const transitEntry = getEntry(index, transitKey);
    const chosen = transitEntry ?? getEntry(index, natalKey);
    if (!chosen || seen.has(chosen.key)) continue;
    seen.add(chosen.key);
    (transitEntry ? context.transit : context.natalArchetypes).push(chosen);
  }
  return context;
}

/**
 * POST { mode, kind, date? } — generate and store the period's forecast.
 * 409 llm_disabled / already_generated / no_hebrew_snapshot, 502 on an
 * unreachable model (nothing stored), 404 without a natal snapshot.
 */
export async function POST(
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
  const client = llmClientFromEnv();
  if (!client) {
    return NextResponse.json(
      { error: "llm_disabled" },
      { status: 409, headers: NO_STORE },
    );
  }
  const parsed = await parseParams(req, "body");
  if (parsed instanceof NextResponse) return parsed;

  const period = periodFor(parsed.kind, parsed.mode, civilFromParam(parsed.date));
  const existing = await getForecast(id, parsed.mode, parsed.kind, period.start);
  if (existing) {
    return NextResponse.json(
      { error: "already_generated" },
      { status: 409, headers: NO_STORE },
    );
  }

  // Both modes read the full profile view: the natal chart for the western
  // summary, and the personal context (personal-data policy,
  // lib/promptData.ts) — birth data, numerology, and any recorded life
  // events — that every forecast prompt now carries.
  if (parsed.mode === "hebrew") await ensureHebrewSnapshot(id);
  const view = await getProfileView(id);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  const personal = {
    birth: birthDataFromProfile(view.profile),
    numerology: toNumeroDerivation(view.numero),
    events: (await listLifeEvents(id)) ?? [],
  };

  let prompt: string;
  let natalVersion: number;
  let contentVersion: string;
  if (parsed.mode === "western") {
    const chart = toWheelChart(view.astro);
    const summary = computeWesternPeriodSummary(chart, view.astro.version, period);
    const entries = westernEntries(summary.topAspects);
    prompt = buildWesternForecastPrompt(summary, chart, entries, personal);
    natalVersion = view.astro.version;
    contentVersion = loadContentIndex().version;
  } else {
    if (!view.hebrew) {
      return NextResponse.json(
        { error: "no_hebrew_snapshot" },
        { status: 409, headers: NO_STORE },
      );
    }
    const summary = computeHebrewPeriodSummary(period);
    const index = loadContentIndex(contentRoot("he"));
    const keys = summary.months.map((m) => `mazal_month/${m.monthKey}`);
    if (parsed.kind === "day") {
      keys.push(`day_planet/${summary.days[0].dayPlanet}`);
      keys.push(`hebrew_date_gematria/${summary.days[0].dateGematria.value}`);
    }
    const entries = [...new Set(keys)]
      .map((k) => getEntry(index, k))
      .filter((e): e is ContentEntry => e !== null);
    prompt = buildHebrewForecastPrompt(
      summary,
      toStoredMazal(view.hebrew),
      toStoredHebrewGematria(view.hebrew),
      entries,
      personal,
    );
    natalVersion = view.astro.version;
    contentVersion = index.version;
  }

  // Shared by both paths: persistence semantics are identical.
  const persist = async (bodyMd: string) => {
    try {
      const forecast = await createForecast({
        profileId: id,
        mode: parsed.mode,
        kind: parsed.kind,
        periodStart: period.start,
        natalVersion,
        bodyMd,
        modelName: client.modelName,
        contentVersion,
      });
      return { done: { period, forecast: serializeForecast(forecast) } };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // A concurrent request generated this period first; keep that one.
        return { errorCode: "already_generated" };
      }
      throw e;
    }
  };

  if (req.nextUrl.searchParams.get("stream") === "1" && client.generateStream) {
    return streamGenerationResponse({
      stream: client.generateStream(prompt, req.signal),
      signal: req.signal,
      label: "forecast",
      persist,
    });
  }

  let bodyMd: string;
  try {
    bodyMd = await client.generate(prompt);
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("[api] forecast:", e);
      return NextResponse.json(
        { error: "llm_unavailable", message: e.message },
        { status: 502, headers: NO_STORE },
      );
    }
    throw e;
  }

  const outcome = await persist(bodyMd);
  if ("done" in outcome) return NextResponse.json(outcome.done, { headers: NO_STORE });
  return NextResponse.json(
    { error: outcome.errorCode },
    { status: 409, headers: NO_STORE },
  );
}

/** DELETE ?mode=&kind=&date?= — discard the period's forecast, freeing the
 *  slot so POST can generate a replacement. */
export async function DELETE(
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
  const parsed = await parseParams(req, "query");
  if (parsed instanceof NextResponse) return parsed;

  const period = periodFor(parsed.kind, parsed.mode, civilFromParam(parsed.date));
  const deleted = await deleteForecast(id, parsed.mode, parsed.kind, period.start);
  if (!deleted) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
