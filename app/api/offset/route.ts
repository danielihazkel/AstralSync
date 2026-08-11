import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveBirthMoment } from "@/lib/tz";

/**
 * Read-only UTC offset preview for onboarding (PRD §3.1): shows the resolved
 * offset for a birth moment before any profile exists, so the user can review
 * and override it. No time defaults to local noon — the same convention
 * `resolveChartMoment` uses for unknown birth time, so this preview always
 * matches what compute will store.
 */
const querySchema = z.object({
  tz: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")
    .optional(),
});

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    tz: params.get("tz") ?? undefined,
    date: params.get("date") ?? undefined,
    time: params.get("time") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { tz, date, time } = parsed.data;
  const [year, month, day] = date.split("-").map(Number);
  try {
    const moment = resolveBirthMoment(tz, {
      year,
      month,
      day,
      hour: time ? Number(time.slice(0, 2)) : 12,
      minute: time ? Number(time.slice(3, 5)) : 0,
    });
    return NextResponse.json({
      tzIana: tz,
      offsetMinutes: moment.offsetMinutes,
      warnings: moment.warnings,
    });
  } catch {
    // Intl throws RangeError for an unknown IANA zone name.
    return NextResponse.json(
      { error: "invalid_input", message: `unknown timezone "${tz}"` },
      { status: 400 },
    );
  }
}
