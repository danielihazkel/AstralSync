import {
  buildChart,
  type ChartSnapshot,
  type HouseSystem,
  type Placement,
} from "@astralsync/astro-core";
import { buildMazalChart, type MazalChart } from "@astralsync/hebrew-core";
import {
  lifePath,
  expression,
  soulUrge,
  gematriaExpression,
  hebrewDateGematria,
  type HebrewDateGematriaResult,
  type LifePathResult,
  type NameNumberResult,
  type NumerologySystem,
} from "@astralsync/numero-core";
import {
  Prisma,
  type AstroSnapshot,
  type GeoCity,
  type HebrewSnapshot,
  type NumeroSnapshot,
  type Profile,
  type Reading,
  type ReadingGenerator,
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
  /** Latin/transliterated name — Pythagorean numerology. */
  fullBirthName: string | null;
  /** Hebrew name — gematria destiny + mispar-katan Mazal reading. */
  hebrewBirthName: string | null;
  /** Vestigial since the two-field name split (validation normalizes
   *  legacy "hebrew" payloads before this shape is built). */
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
  /** Primary system: "gematria" only when exclusively a Hebrew name exists —
   *  preserves the meaning of legacy snapshot rows bit-for-bit. */
  system: NumerologySystem;
  lifePath: LifePathResult;
  /** The primary system's destiny. */
  destiny: NameNumberResult | null;
  /** Pythagorean only — not offered for unvocalized Hebrew. */
  soulUrge: NameNumberResult | null;
  /** Hechrachi gematria of hebrewBirthName; null without a Hebrew name.
   *  Equals `destiny` for Hebrew-only profiles. */
  hebrewDestiny: NameNumberResult | null;
}

/**
 * Birth data → numerology results. The two name fields are independent:
 * the Latin name feeds Pythagorean destiny + Soul Urge, the Hebrew name
 * feeds gematria — a profile may have both, either, or neither (PRD §4.6).
 */
export function computeNumero(d: ProfileBirthData): NumeroResult {
  const lp = lifePath(d.birthDate);
  const latin = d.fullBirthName?.trim();
  const hebrew = d.hebrewBirthName?.trim();
  const hebrewDestiny = hebrew ? gematriaExpression(hebrew) : null;
  if (latin) {
    return {
      system: "pythagorean",
      lifePath: lp,
      destiny: expression(latin),
      soulUrge: soulUrge(latin),
      hebrewDestiny,
    };
  }
  if (hebrewDestiny) {
    return {
      system: "gematria",
      lifePath: lp,
      destiny: hebrewDestiny,
      soulUrge: null,
      hebrewDestiny,
    };
  }
  return {
    system: "pythagorean",
    lifePath: lp,
    destiny: null,
    soulUrge: null,
    hebrewDestiny: null,
  };
}

export interface HebrewResult {
  mazal: MazalChart;
  dateGematria: HebrewDateGematriaResult;
  /** Mispar katan name reading; null unless the profile has a Hebrew name. */
  katanName: NameNumberResult | null;
}

/**
 * Birth data → Hebrew (Mazal) results. Reuses the chart moment resolution,
 * so the sunset comparison sees the same UTC instant as the astro chart
 * (including the local-noon convention and the manual offset override).
 * Date gematria is keyed to the effective (sunset-adjusted) Hebrew date.
 */
export function computeHebrew(d: ProfileBirthData): HebrewResult {
  const moment = resolveChartMoment(d);
  const mazal = buildMazalChart({
    civilDate: d.birthDate,
    utc: moment.utc,
    latitude: d.birthLat,
    longitude: d.birthLng,
    tzId: d.tzIana,
    timeCertainty: d.timeCertainty,
  });
  const dateGematria = hebrewDateGematria({
    day: mazal.hebrewDate.effective.day,
    year: mazal.hebrewDate.effective.year,
  });
  const name = d.hebrewBirthName?.trim();
  const katanName = name ? gematriaExpression(name, "katan") : null;
  return { mazal, dateGematria, katanName };
}

export interface SnapshotRows {
  astroRow: Prisma.AstroSnapshotUncheckedCreateInput;
  numeroRow: Prisma.NumeroSnapshotUncheckedCreateInput;
  hebrewRow: Prisma.HebrewSnapshotUncheckedCreateInput;
}

/**
 * Map computed results to write-once snapshot rows for `version`.
 * `placementsJson` is the complete chart record minus aspects (which get
 * their own column) plus the tz warnings from moment resolution — the UI
 * must be able to render exclusively from these two JSON columns.
 */
function buildHebrewRow(
  profileId: number,
  version: number,
  hebrew: HebrewResult,
): Prisma.HebrewSnapshotUncheckedCreateInput {
  const effective = hebrew.mazal.hebrewDate.effective;
  return {
    profileId,
    version,
    hebrewDate: `${effective.day} ${effective.monthName} ${effective.year}`,
    monthKey: effective.monthKey,
    dayPlanet: hebrew.mazal.dayPlanet.planet,
    hourPlanet: hebrew.mazal.planetaryHour?.planet ?? null,
    dateGematriaInt: hebrew.dateGematria.value,
    mazalJson: hebrew.mazal as unknown as Prisma.InputJsonValue,
    gematriaJson: {
      dateGematria: hebrew.dateGematria,
      katanName: hebrew.katanName,
    } as unknown as Prisma.InputJsonValue,
    engine: hebrew.mazal.engine.name,
    engineVersion: hebrew.mazal.engine.version,
    contentVersion: CONTENT_VERSION,
  };
}

export function buildSnapshotRows(
  profileId: number,
  version: number,
  astro: AstroResult,
  numero: NumeroResult,
  hebrew: HebrewResult,
  requestedHouseSystem: HouseSystem,
): SnapshotRows {
  const { aspects, ...chartSansAspects } = astro.chart;
  return {
    hebrewRow: buildHebrewRow(profileId, version, hebrew),
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
        hebrewDestiny: numero.hebrewDestiny,
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
    hebrewBirthName: input.hebrewBirthName ?? null,
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
    (existing.hebrewBirthName ?? null) !== (input.hebrewBirthName ?? null) ||
    existing.nameScript !== input.nameScript ||
    latestAstro.houseSystem !== input.houseSystem
  );
}

export interface ProfileView {
  profile: ReturnType<typeof serializeProfile>;
  astro: ReturnType<typeof serializeAstro>;
  numero: ReturnType<typeof serializeNumero>;
  /** Null for versions computed before the Hebrew feature (Phase 2b): only
   *  the latest version is lazily backfilled, history stays as-is. */
  hebrew: ReturnType<typeof serializeHebrew> | null;
}

function serializeProfile(p: Profile & { birthCity: GeoCity | null }) {
  return {
    id: p.id,
    displayName: p.displayName,
    fullBirthName: p.fullBirthName,
    hebrewBirthName: p.hebrewBirthName,
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

function serializeAstro(s: AstroSnapshot & { readings?: Reading[] }) {
  const llm = s.readings?.find((r) => r.generator === "llm") ?? null;
  return {
    snapshotId: s.id,
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
    /** Stored LLM synthesis for this snapshot, if one was ever generated. */
    llmReading: llm
      ? {
          bodyMd: llm.bodyMd,
          modelName: llm.modelName,
          contentVersion: llm.contentVersion,
          createdAt: llm.createdAt,
        }
      : null,
  };
}

function serializeHebrew(s: HebrewSnapshot, readings?: Reading[]) {
  // The hebrew_llm reading physically lives on the astro snapshot row (they
  // share profileId+version); the caller passes the astro's included readings.
  const llm = readings?.find((r) => r.generator === "hebrew_llm") ?? null;
  return {
    snapshotId: s.id,
    version: s.version,
    hebrewDate: s.hebrewDate,
    monthKey: s.monthKey,
    dayPlanet: s.dayPlanet,
    hourPlanet: s.hourPlanet,
    dateGematria: s.dateGematriaInt,
    mazal: s.mazalJson,
    gematria: s.gematriaJson,
    engine: s.engine,
    engineVersion: s.engineVersion,
    contentVersion: s.contentVersion,
    createdAt: s.createdAt,
    /** Stored Hebrew LLM synthesis for this snapshot version, if any. */
    llmReading: llm
      ? {
          bodyMd: llm.bodyMd,
          modelName: llm.modelName,
          contentVersion: llm.contentVersion,
          createdAt: llm.createdAt,
        }
      : null,
  };
}

function serializeNumero(s: NumeroSnapshot) {
  return {
    snapshotId: s.id,
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
  const hebrew = computeHebrew(d);

  const id = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({
      data: profileColumns(input, tz, astro.offsetMinutes),
    });
    const { astroRow, numeroRow, hebrewRow } = buildSnapshotRows(
      profile.id,
      1,
      astro,
      numero,
      hebrew,
      input.houseSystem,
    );
    await tx.astroSnapshot.create({ data: astroRow });
    await tx.numeroSnapshot.create({ data: numeroRow });
    await tx.hebrewSnapshot.create({ data: hebrewRow });
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
  const hebrew = computeHebrew(d);

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
    const { astroRow, numeroRow, hebrewRow } = buildSnapshotRows(
      id,
      version,
      astro,
      numero,
      hebrew,
      input.houseSystem,
    );
    await tx.astroSnapshot.create({ data: astroRow });
    await tx.numeroSnapshot.create({ data: numeroRow });
    await tx.hebrewSnapshot.create({ data: hebrewRow });
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

  const withReadings = {
    readings: {
      where: { generator: { in: ["llm", "hebrew_llm"] as ReadingGenerator[] } },
    },
  };
  const astro =
    version != null
      ? await prisma.astroSnapshot.findUnique({
          where: { profileId_version: { profileId: id, version } },
          include: withReadings,
        })
      : await prisma.astroSnapshot.findFirst({
          where: { profileId: id },
          orderBy: { version: "desc" },
          include: withReadings,
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

  // Keyed to the astro version actually being viewed; null for versions that
  // predate the Hebrew feature and were never backfilled.
  const hebrew = await prisma.hebrewSnapshot.findUnique({
    where: { profileId_version: { profileId: id, version: astro.version } },
  });

  return {
    profile: serializeProfile(profile),
    astro: serializeAstro(astro),
    numero: serializeNumero(numero),
    hebrew: hebrew ? serializeHebrew(hebrew, astro.readings) : null,
  };
}

/** Stored profile row → the pure computation shape (for lazy backfill). */
export function profileRowToBirthData(p: Profile): ProfileBirthData {
  const [year, month, day] = dateOnly(p.birthDate).split("-").map(Number);
  return {
    fullBirthName: p.fullBirthName,
    hebrewBirthName: p.hebrewBirthName,
    nameScript: p.nameScript,
    birthDate: { year, month, day },
    birthTime: p.birthTime
      ? {
          hour: Number(p.birthTime.slice(0, 2)),
          minute: Number(p.birthTime.slice(3, 5)),
        }
      : null,
    timeCertainty: p.timeCertainty,
    birthLat: p.birthLat,
    birthLng: p.birthLng,
    tzIana: p.tzIana,
    overrideOffsetMinutes: p.offsetOverridden ? p.utcOffsetMinutes : null,
  };
}

/**
 * Lazy backfill for pre-feature profiles: create-on-view, latest version
 * only. This is a write-once create — never an update — so the guard in
 * lib/db.ts is untouched; historical versions never get a Hebrew row and
 * render a "not computed for this version" notice instead. `getProfileView`
 * stays a pure read: callers invoke this explicitly before viewing.
 */
export async function ensureHebrewSnapshot(profileId: number): Promise<void> {
  const latestAstro = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  if (!latestAstro) return;
  const existing = await prisma.hebrewSnapshot.findUnique({
    where: {
      profileId_version: { profileId, version: latestAstro.version },
    },
    select: { id: true },
  });
  if (existing) return;
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return;

  const hebrew = computeHebrew(profileRowToBirthData(profile));
  try {
    await prisma.hebrewSnapshot.create({
      data: buildHebrewRow(profileId, latestAstro.version, hebrew),
    });
  } catch (e) {
    // A concurrent view won the race — the unique constraint makes the
    // create idempotent, which is exactly what we want.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return;
    }
    throw e;
  }
}

/** Display name only, for page metadata — cheaper than a full view. */
export async function getProfileName(id: number): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { displayName: true },
  });
  return profile?.displayName ?? null;
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
      // Lean natal placements for the home page's Today dashboard.
      placements:
        (latest?.placementsJson as unknown as { placements?: Placement[] } | null)
          ?.placements ?? null,
    };
  });
}

/** Snapshot version list for the history UI — newest first. */
export async function listSnapshotVersions(profileId: number) {
  const versions = await prisma.astroSnapshot.findMany({
    where: { profileId },
    orderBy: { version: "desc" },
    select: {
      version: true,
      createdAt: true,
      houseSystem: true,
      isSolarChart: true,
    },
  });
  return versions;
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
      hebrewSnapshots: { orderBy: { version: "asc" } },
    },
  });
  if (!profile) return null;

  const { astroSnapshots, numeroSnapshots, hebrewSnapshots, birthCity, ...columns } =
    profile;
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: { ...columns, birthDate: dateOnly(columns.birthDate) },
    birthCity,
    astroSnapshots: astroSnapshots.map(({ readings: _r, ...s }) => s),
    numeroSnapshots,
    // Additive (exportVersion stays 1); sparse for pre-feature versions.
    hebrewSnapshots,
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
