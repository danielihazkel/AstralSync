import type { Aspect, ChartSnapshot } from "@astralsync/astro-core";
import type { MazalChart } from "@astralsync/hebrew-core";
import type {
  HebrewDateGematriaResult,
  LifePathResult,
  NameNumberResult,
} from "@astralsync/numero-core";
import type { ProfileView } from "./snapshots";
import type { TzWarning } from "./tz";

/**
 * View-side shapes for the stored snapshot JSON. The DB splits the chart
 * across two columns — `placementsJson` (the ChartSnapshot minus aspects,
 * plus tz warnings) and `aspectsJson` — so the UI recombines them here.
 * Type-only imports keep this module client-safe.
 */

export type StoredChart = Omit<ChartSnapshot, "aspects"> & {
  tzWarnings: TzWarning[];
};

export type WheelChart = StoredChart & { aspects: Aspect[] };

export type AstroView = ProfileView["astro"];
export type NumeroView = ProfileView["numero"];
export type ProfileData = ProfileView["profile"];
/** Non-null Hebrew snapshot view; ProfileView.hebrew itself is nullable
 *  (pre-feature versions are never backfilled). */
export type HebrewView = NonNullable<ProfileView["hebrew"]>;

/** Shape of the stored `mazalJson` column. */
export type StoredMazal = MazalChart;

/** Shape of the stored `gematriaJson` column. */
export interface StoredHebrewGematria {
  dateGematria: HebrewDateGematriaResult;
  katanName: NameNumberResult | null;
}

/** Shape of the stored `derivationJson` column. */
export interface NumeroDerivation {
  lifePath: LifePathResult;
  destiny: NameNumberResult | null;
  soulUrge: NameNumberResult | null;
  /** Absent on snapshots computed before the two-field name split. */
  hebrewDestiny?: NameNumberResult | null;
}

export function toWheelChart(astro: AstroView): WheelChart {
  const chart = astro.chart as unknown as StoredChart;
  const aspects = (astro.aspects as unknown as Aspect[]) ?? [];
  return { ...chart, aspects };
}

export function toStoredMazal(hebrew: HebrewView): StoredMazal {
  return hebrew.mazal as unknown as StoredMazal;
}

export function toStoredHebrewGematria(hebrew: HebrewView): StoredHebrewGematria {
  return hebrew.gematria as unknown as StoredHebrewGematria;
}

export function toNumeroDerivation(
  numero: Pick<NumeroView, "derivation">,
): NumeroDerivation {
  return numero.derivation as unknown as NumeroDerivation;
}

/**
 * Build the reading input for `resolveReading` from a numero snapshot view.
 * The return shape structurally matches content.ts's `NumeroReadingInput`
 * (declared here inline to avoid an import cycle — content.ts already
 * imports this module).
 */
export function toNumeroReadingInput(
  numero: Pick<NumeroView, "lifePath" | "isMasterLifePath" | "derivation">,
): {
  lifePath: number;
  isMaster: boolean;
  destiny: { value: number; isMaster: boolean } | null;
  soulUrge: { value: number; isMaster: boolean } | null;
} {
  const d = toNumeroDerivation(numero);
  return {
    lifePath: numero.lifePath,
    isMaster: numero.isMasterLifePath,
    destiny: d.destiny
      ? { value: d.destiny.value, isMaster: d.destiny.isMaster }
      : null,
    soulUrge: d.soulUrge
      ? { value: d.soulUrge.value, isMaster: d.soulUrge.isMaster }
      : null,
  };
}
