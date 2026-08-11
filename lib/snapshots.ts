import {
  buildChart,
  type ChartSnapshot,
  type HouseSystem,
} from "@astralsync/astro-core";
import {
  lifePath,
  expression,
  soulUrge,
  gematriaExpression,
  type LifePathResult,
  type NameNumberResult,
  type NumerologySystem,
} from "@astralsync/numero-core";
import {
  Prisma,
  type AstroSnapshot,
  type GeoCity,
  type NumeroSnapshot,
  type Profile,
} from "@prisma/client";
import { prisma } from "./db";
import { resolveBirthMoment, timezoneFor, type TzWarning } from "./tz";
import { toProfileBirthData, type ProfileInput } from "./validation";
import { CONTENT_VERSION } from "./versions";

/**
 * Compute-once service (PRD §4.4): a chart is calculated exactly once, at
 * profile creation or edit, and read from its snapshot forever after. The
 * functions in this file are pure — they take validated birth data and
 * return chart results and Prisma-ready snapshot rows. DB orchestration
 * lives below in the profile CRUD functions.
 */

/** Validated, computation-relevant profile fields (pre-persistence shape). */
export interface ProfileBirthData {
  fullBirthName: string | null;
  nameScript: "latin" | "hebrew" | "other";
  birthDate: { year: number; month: number; day: number };
  /** Null ⇔ timeCertainty is "unknown". */
  birthTime: { hour: number; minute: number } | null;
  timeCertainty: "exact" | "approx" | "unknown";
  birthLat: number;
  birthLng: number;
  tzIana: string;
  /** Set only when the user manually overrode the resolved UTC offset. */
  overrideOffsetMinutes: number | null;
}

export interface ChartMoment {
  utc: Date;
  offsetMinutes: number;
  warnings: TzWarning[];
}

/**
 * Birth data → UTC instant. Unknown time uses local noon (the solar-chart
 * convention, see astro-core `ChartInput`). A manual offset override is
 * applied verbatim instead of consulting the IANA database — that is the
 * PRD §3.1 escape hatch for pre-1970 offsets the database gets wrong.
 */
export function resolveChartMoment(d: ProfileBirthData): ChartMoment {
  const wall = {
    ...d.birthDate,
    hour: d.birthTime?.hour ?? 12,
    minute: d.birthTime?.minute ?? 0,
  };
  if (d.overrideOffsetMinutes !== null) {
    const wallAsUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
    );
    const warnings: TzWarning[] =
      wall.year < 1970 ? ["pre_1970_offset_uncertain"] : [];
    return {
      utc: new Date(wallAsUtc - d.overrideOffsetMinutes * 60_000),
      offsetMinutes: d.overrideOffsetMinutes,
      warnings,
    };
  }
  return resolveBirthMoment(d.tzIana, wall);
}

export interface AstroResult {
  chart: ChartSnapshot;
  offsetMinutes: number;
  tzWarnings: TzWarning[];
}

/** Birth data + house system → full astro-core chart snapshot. */
export function computeAstro(
  d: ProfileBirthData,
  houseSystem: HouseSystem,
): AstroResult {
  const moment = resolveChartMoment(d);
  const chart = buildChart({
    utc: moment.utc,
    latitude: d.birthLat,
    longitude: d.birthLng,
    houseSystem,
    timeCertainty: d.timeCertainty,
  });
  return {
    chart,
    offsetMinutes: moment.offsetMinutes,
    tzWarnings: moment.warnings,
  };
}

export interface NumeroResult {
  system: NumerologySystem;
  lifePath: LifePathResult;
  destiny: NameNumberResult | null;
  soulUrge: NameNumberResult | null;
}

/**
 * Birth data → numerology results. The system follows the name script:
 * Hebrew names use gematria (destiny only — Soul Urge is deliberately not
 * offered for unvocalized Hebrew); everything else uses Pythagorean.
 * Name numbers are null when no birth name was provided (PRD §4.6).
 */
export function computeNumero(d: ProfileBirthData): NumeroResult {
  const lp = lifePath(d.birthDate);
  const name = d.fullBirthName?.trim();
  if (!name) {
    return { system: "pythagorean", lifePath: lp, destiny: null, soulUrge: null };
  }
  if (d.nameScript === "hebrew") {
    return {
      system: "gematria",
      lifePath: lp,
      destiny: gematriaExpression(name),
      soulUrge: null,
    };
  }
  return {
    system: "pythagorean",
    lifePath: lp,
    destiny: expression(name),
    soulUrge: soulUrge(name),
  };
}

export interface SnapshotRows {
  astroRow: Prisma.AstroSnapshotUncheckedCreateInput;
  numeroRow: Prisma.NumeroSnapshotUncheckedCreateInput;
}

/**
 * Map computed results to write-once snapshot rows for `version`.
 * `placementsJson` is the complete chart record minus aspects (which get
 * their own column) plus the tz warnings from moment resolution — the UI
 * must be able to render exclusively from these two JSON columns.
 */
export function buildSnapshotRows(
  profileId: number,
  version: number,
  astro: AstroResult,
  numero: NumeroResult,
  requestedHouseSystem: HouseSystem,
): SnapshotRows {
  const { aspects, ...chartSansAspects } = astro.chart;
  return {
    astroRow: {
      profileId,
      version,
      // The system the user asked for; the system actually used after a
      // Placidus high-latitude fallback is placementsJson.houses.system.
      houseSystem: requestedHouseSystem,
      isSolarChart: astro.chart.isSolarChart,
      sunSign: astro.chart.bigThree.sun,
      moonSign: astro.chart.bigThree.moon,
      ascendant: astro.chart.bigThree.ascendant,
      placementsJson: {
        ...chartSansAspects,
        tzWarnings: astro.tzWarnings,
      } as unknown as Prisma.InputJsonValue,
      aspectsJson: aspects as unknown as Prisma.InputJsonValue,
      engine: astro.chart.engine.name,
      engineVersion: astro.chart.engine.version,
      contentVersion: CONTENT_VERSION,
    },
    numeroRow: {
      profileId,
      version,
      system: numero.system,
      lifePathInt: numero.lifePath.value,
      destinyInt: numero.destiny?.value ?? null,
      soulUrgeInt: numero.soulUrge?.value ?? null,
      isMasterLp: numero.lifePath.isMaster,
      derivationJson: {
        lifePath: numero.lifePath,
        destiny: numero.destiny,
        soulUrge: numero.soulUrge,
      } as unknown as Prisma.InputJsonValue,
    },
  };
}

// ---------------------------------------------------------------------------
// DB orchestration (profile CRUD). Compute happens before any transaction
// opens; transactions only read the latest version and write rows.
// ---------------------------------------------------------------------------

export class UnknownCityError extends Error {
  constructor(geonameId: number) {
    super(`birthCityGeonameId ${geonameId} does not exist`);
  }
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolvedTz(input: ProfileInput): string {
  return input.tzIana ?? timezoneFor(input.birthLat, input.birthLng);
}

function profileColumns(input: ProfileInput, tz: string, offsetMinutes: number) {
  const [y, m, d] = input.birthDate.split("-").map(Number);
  return {
    displayName: input.displayName,
    fullBirthName: input.fullBirthName ?? null,
    nameScript: input.nameScript,
    // @db.Date column: construct at UTC midnight to avoid local-tz off-by-one.
    birthDate: new Date(Date.UTC(y, m - 1, d)),
    birthTime: input.birthTime ?? null,
    timeCertainty: input.timeCertainty,
    birthCityGeonameId: input.birthCityGeonameId ?? null,
    birthLat: input.birthLat,
    birthLng: input.birthLng,
    tzIana: tz,
    utcOffsetMinutes: offsetMinutes,
    offsetOverridden: input.offsetOverridden,
  };
}

/**
 * Does this edit change anything the chart or numerology depends on?
 * Presentational fields (displayName, city label) don't count — the
 * compute-once rule means they must not trigger a recompute.
 */
function computationChanged(
  existing: Profile,
  latestAstro: AstroSnapshot | null,
  input: ProfileInput,
  tz: string,
): boolean {
  if (!latestAstro) return true;
  const overrideBefore = existing.offsetOverridden
    ? existing.utcOffsetMinutes
    : null;
  const overrideAfter = input.offsetOverridden
    ? (input.utcOffsetMinutes as number)
    : null;
  return (
    dateOnly(existing.birthDate) !== input.birthDate ||
    (existing.birthTime ?? null) !== (input.birthTime ?? null) ||
    existing.timeCertainty !== input.timeCertainty ||
    existing.birthLat !== input.birthLat ||
    existing.birthLng !== input.birthLng ||
    existing.tzIana !== tz ||
    overrideBefore !== overrideAfter ||
    (existing.fullBirthName ?? null) !== (input.fullBirthName ?? null) ||
    existing.nameScript !== input.nameScript ||
    latestAstro.houseSystem !== input.houseSystem
  );
}

export interface ProfileView {
  profile: ReturnType<typeof serializeProfile>;
  astro: ReturnType<typeof serializeAstro>;
  numero: ReturnType<typeof serializeNumero>;
}

function serializeProfile(p: Profile & { birthCity: GeoCity | null }) {
  return {
    id: p.id,
    displayName: p.displayName,
    fullBirthName: p.fullBirthName,
    nameScript: p.nameScript,
    birthDate: dateOnly(p.birthDate),
    birthTime: p.birthTime,
    timeCertainty: p.timeCertainty,
    birthCity: p.birthCity
      ? {
          geonameId: p.birthCity.geonameId,
          name: p.birthCity.name,
          countryCode: p.birthCity.countryCode,
          admin1: p.birthCity.admin1,
        }
      : null,
    birthLat: p.birthLat,
    birthLng: p.birthLng,
    tzIana: p.tzIana,
    utcOffsetMinutes: p.utcOffsetMinutes,
    offsetOverridden: p.offsetOverridden,
    createdAt: p.createdAt,
  };
}

function serializeAstro(s: AstroSnapshot) {
  return {
    version: s.version,
    houseSystem: s.houseSystem,
    isSolarChart: s.isSolarChart,
    sunSign: s.sunSign,
    moonSign: s.moonSign,
    ascendant: s.ascendant,
    chart: s.placementsJson,
    aspects: s.aspectsJson,
    engine: s.engine,
    engineVersion: s.engineVersion,
    contentVersion: s.contentVersion,
    createdAt: s.createdAt,
  };
}

function serializeNumero(s: NumeroSnapshot) {
  return {
    version: s.version,
    system: s.system,
    lifePath: s.lifePathInt,
    destiny: s.destinyInt,
    soulUrge: s.soulUrgeInt,
    isMasterLifePath: s.isMasterLp,
    derivation: s.derivationJson,
    createdAt: s.createdAt,
  };
}

async function assertCityExists(geonameId: number | null | undefined) {
  if (geonameId == null) return;
  const city = await prisma.geoCity.findUnique({ where: { geonameId } });
  if (!city) throw new UnknownCityError(geonameId);
}

export async function createProfile(input: ProfileInput): Promise<ProfileView> {
  await assertCityExists(input.birthCityGeonameId);
  const tz = resolvedTz(input);
  const d = toProfileBirthData(input, tz);
  const astro = computeAstro(d, input.houseSystem);
  const numero = computeNumero(d);

  const id = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({
      data: profileColumns(input, tz, astro.offsetMinutes),
    });
    const { astroRow, numeroRow } = buildSnapshotRows(
      profile.id,
      1,
      astro,
      numero,
      input.houseSystem,
    );
    await tx.astroSnapshot.create({ data: astroRow });
    await tx.numeroSnapshot.create({ data: numeroRow });
    return profile.id;
  });
  return (await getProfileView(id)) as ProfileView;
}

export async function editProfile(
  id: number,
  input: ProfileInput,
): Promise<ProfileView | null> {
  const existing = await prisma.profile.findUnique({ where: { id } });
  if (!existing) return null;
  await assertCityExists(input.birthCityGeonameId);
  const tz = resolvedTz(input);
  const latestAstro = await prisma.astroSnapshot.findFirst({
    where: { profileId: id },
    orderBy: { version: "desc" },
  });

  if (!computationChanged(existing, latestAstro, input, tz)) {
    // Presentational-only edit: no recompute, no new snapshot version.
    await prisma.profile.update({
      where: { id },
      data: {
        displayName: input.displayName,
        birthCityGeonameId: input.birthCityGeonameId ?? null,
      },
    });
    return getProfileView(id);
  }

  const d = toProfileBirthData(input, tz);
  const astro = computeAstro(d, input.houseSystem);
  const numero = computeNumero(d);

  await prisma.$transaction(async (tx) => {
    const latest = await tx.astroSnapshot.findFirst({
      where: { profileId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await tx.profile.update({
      where: { id },
      data: profileColumns(input, tz, astro.offsetMinutes),
    });
    const { astroRow, numeroRow } = buildSnapshotRows(
      id,
      version,
      astro,
      numero,
      input.houseSystem,
    );
    await tx.astroSnapshot.create({ data: astroRow });
    await tx.numeroSnapshot.create({ data: numeroRow });
  });
  return getProfileView(id);
}

/** Read a profile with one snapshot pair — latest by default, or `version`. */
export async function getProfileView(
  id: number,
  version?: number,
): Promise<ProfileView | null> {
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { birthCity: true },
  });
  if (!profile) return null;

  const astro =
    version != null
      ? await prisma.astroSnapshot.findUnique({
          where: { profileId_version: { profileId: id, version } },
        })
      : await prisma.astroSnapshot.findFirst({
          where: { profileId: id },
          orderBy: { version: "desc" },
        });
  const numero =
    version != null
      ? await prisma.numeroSnapshot.findUnique({
          where: { profileId_version: { profileId: id, version } },
        })
      : await prisma.numeroSnapshot.findFirst({
          where: { profileId: id },
          orderBy: { version: "desc" },
        });
  if (!astro || !numero) return null;

  return {
    profile: serializeProfile(profile),
    astro: serializeAstro(astro),
    numero: serializeNumero(numero),
  };
}

export async function listProfiles() {
  const profiles = await prisma.profile.findMany({
    orderBy: { createdAt: "asc" },
    include: { astroSnapshots: { orderBy: { version: "desc" }, take: 1 } },
  });
  return profiles.map((p) => {
    const latest = p.astroSnapshots[0];
    return {
      id: p.id,
      displayName: p.displayName,
      birthDate: dateOnly(p.birthDate),
      timeCertainty: p.timeCertainty,
      sunSign: latest?.sunSign ?? null,
      isSolarChart: latest?.isSolarChart ?? false,
      latestVersion: latest?.version ?? 0,
      createdAt: p.createdAt,
    };
  });
}

/** Full data export (PRD §4.6): every snapshot version, every reading. */
export async function exportProfile(id: number) {
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: {
      birthCity: true,
      astroSnapshots: {
        orderBy: { version: "asc" },
        include: { readings: true },
      },
      numeroSnapshots: { orderBy: { version: "asc" } },
    },
  });
  if (!profile) return null;

  const { astroSnapshots, numeroSnapshots, birthCity, ...columns } = profile;
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: { ...columns, birthDate: dateOnly(columns.birthDate) },
    birthCity,
    astroSnapshots: astroSnapshots.map(({ readings: _r, ...s }) => s),
    numeroSnapshots,
    readings: astroSnapshots.flatMap((s) => s.readings),
  };
}

/** Hard delete (PRD §4.6). Snapshots and readings go via DB cascade. */
export async function deleteProfile(id: number): Promise<boolean> {
  try {
    await prisma.profile.delete({ where: { id } });
    return true;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return false;
    }
    throw e;
  }
}
