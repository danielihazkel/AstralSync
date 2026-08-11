import type { Element } from "./dominance";

/**
 * Template-synthesized reading: the intersection of a chart's dominant
 * element with the Life Path number (PRD §3.4). Pure composition over the
 * `essence` lines of the two resolved content entries plus original
 * connective copy that lives here — 4 × 13 combinations without authoring
 * each one. Deterministic by design so old snapshots re-render identically.
 *
 * Grammar contract (enforced by the content lint test's README rules):
 * `essence` is a lowercase noun phrase that reads naturally after
 * "showing up as …" / "— …".
 */

export interface SynthesisElementInput {
  name: Element;
  title: string;
  essence: string;
}

export interface SynthesisLifePathInput {
  value: number;
  isMaster: boolean;
  title: string;
  essence: string;
}

const ELEMENT_VOICE: Record<Element, { opener: string; bridge: string }> = {
  fire: {
    opener:
      "Your chart runs hot — most of its weight sits in fire signs, showing up as",
    bridge: "Heat like that needs a direction, and your Life Path points one out:",
  },
  earth: {
    opener:
      "Your chart is built on solid ground — the balance of its planets sit in earth signs, giving you",
    bridge:
      "Steadiness turns purposeful when it has a road, and your Life Path names it:",
  },
  air: {
    opener:
      "Your chart lives in motion — with its planets clustered in air signs, you lead with",
    bridge:
      "All that mental motion wants an anchor, and your Life Path provides one:",
  },
  water: {
    opener:
      "Your chart runs deep — its planets gather in water signs, giving you",
    bridge:
      "Feeling that strong needs a channel, and your Life Path carves one:",
  },
};

export function synthesizeReading(args: {
  element: SynthesisElementInput;
  lifePath: SynthesisLifePathInput | null;
}): string {
  const { element, lifePath } = args;
  const voice = ELEMENT_VOICE[element.name];
  const opening = `${voice.opener} ${element.essence}.`;

  if (!lifePath) {
    return `${opening} With no Life Path on record, let the elemental balance carry this reading on its own.`;
  }

  const closing = lifePath.isMaster
    ? `${lifePath.value} is a master number: its themes arrive louder, mature later, and reward more deliberate handling than a single-digit path.`
    : `Read the ${element.name} emphasis as your default weather and the path as the road it travels — the pairing is the point.`;

  return [
    opening,
    `${voice.bridge} **${lifePath.title}** — ${lifePath.essence}. ${closing}`,
  ].join("\n\n");
}
