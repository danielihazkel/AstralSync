/**
 * The 28 lunar mansions (manazil al-qamar), tropical: equal 12°51′26″
 * divisions from 0° Aries, located by the Moon's longitude. Names are the
 * customary Arabic transliterations; natures and uses are the
 * Picatrix/Agrippa electional tradition, abridged — offered as tradition,
 * not prediction. Pure and dependency-free (client-safe): the Today strip,
 * the almanac and the electional picker all read it.
 */

export type MansionNature = "fortunate" | "unfortunate" | "mixed";

export interface LunarMansion {
  /** 1–28. */
  index: number;
  name: string;
  meaning: string;
  nature: MansionNature;
  /** The tradition's electional uses, abridged. */
  goodFor: string;
}

export const MANSION_SPAN = 360 / 28;

const M = (
  index: number,
  name: string,
  meaning: string,
  nature: MansionNature,
  goodFor: string,
): LunarMansion => ({ index, name, meaning, nature, goodFor });

export const LUNAR_MANSIONS: LunarMansion[] = [
  M(1, "Al-Sharatan", "the two signs", "mixed", "journeys and taking medicine; quarrels sown as easily as seeds"),
  M(2, "Al-Butain", "the little belly", "mixed", "finding what is hidden and holding what is caught; hard on new ventures"),
  M(3, "Al-Thurayya", "the many little ones (Pleiades)", "fortunate", "sailing, craft-work and alchemy; all that needs many hands"),
  M(4, "Al-Dabaran", "the follower", "unfortunate", "little — the tradition marks it for discord; build nothing new under it"),
  M(5, "Al-Haq'ah", "the white spot", "fortunate", "homecomings, study and the health of the body"),
  M(6, "Al-Han'ah", "the brand", "mixed", "hunting and sieges; friendship fares worse than pursuit"),
  M(7, "Al-Dhira'", "the forearm", "fortunate", "gain, friendship and lovers; good for planting and trade"),
  M(8, "Al-Nathrah", "the gap", "mixed", "love and travel; also the driving out of small pests and old habits"),
  M(9, "Al-Tarf", "the glance", "unfortunate", "little — harvests and travellers suffer; a mansion for waiting"),
  M(10, "Al-Jabhah", "the forehead", "fortunate", "love, goodwill and the strengthening of buildings"),
  M(11, "Al-Zubrah", "the mane", "fortunate", "commerce, journeys and the freeing of the bound"),
  M(12, "Al-Sarfah", "the changer", "mixed", "crops and plantings prosper; sailing does not"),
  M(13, "Al-'Awwa'", "the barker", "fortunate", "goodwill, gain, voyages and harvests"),
  M(14, "Al-Simak", "the unarmed", "mixed", "marriage and cures for the sick; hinders the road"),
  M(15, "Al-Ghafr", "the cover", "unfortunate", "digging and the unearthing of things; discord travels with it"),
  M(16, "Al-Zubana", "the claws", "unfortunate", "little — journeys, marriages and merchandise all go poorly"),
  M(17, "Al-Iklil", "the crown", "fortunate", "sieges, building and whatever must hold fast"),
  M(18, "Al-Qalb", "the heart", "unfortunate", "little that is open — the tradition gives it to conspiracies"),
  M(19, "Al-Shaulah", "the sting", "unfortunate", "besieging and driving out; ruinous to ships"),
  M(20, "Al-Na'a'im", "the ostriches", "mixed", "taming of beasts and the speeding of messengers"),
  M(21, "Al-Baldah", "the district", "mixed", "harvests, gain and building; partings come easily too"),
  M(22, "Sa'd al-Dhabih", "the luck of the slaughterer", "mixed", "escape and release; cures begun under it take"),
  M(23, "Sa'd Bula'", "the luck of the swallower", "mixed", "release of captives and health; marriages do less well"),
  M(24, "Sa'd al-Su'ud", "the luckiest of the lucky", "fortunate", "marriage, victory and the goodwill of allies"),
  M(25, "Sa'd al-Akhbiyah", "the luck of the tents", "unfortunate", "sieges and revenge; messengers are delayed"),
  M(26, "Al-Fargh al-Awwal", "the first spout", "fortunate", "union, love and the health of the confined; delay building"),
  M(27, "Al-Fargh al-Thani", "the second spout", "mixed", "harvests, trade and medicine; watch for mischief at the edges"),
  M(28, "Batn al-Hut", "the belly of the fish", "fortunate", "harvests, safe roads and the joy of marriage"),
];

/** The mansion holding an ecliptic longitude. */
export function lunarMansion(longitude: number): LunarMansion {
  const norm = ((longitude % 360) + 360) % 360;
  return LUNAR_MANSIONS[Math.min(27, Math.floor(norm / MANSION_SPAN))];
}
