import { describe, expect, it } from "vitest";
import {
  EMPTY_JOURNAL_DRAFT,
  EMPTY_LIFE_EVENT_DRAFT,
  clearDraft,
  draftKey,
  isJournalDraftEmpty,
  isLifeEventDraftEmpty,
  loadDraft,
  parseJournalDraft,
  parseLifeEventDraft,
  saveDraft,
} from "./drafts";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

describe("draft store", () => {
  it("keys drafts per kind and profile", () => {
    expect(draftKey("journal", 7)).not.toBe(draftKey("journal", 8));
    expect(draftKey("journal", 7)).not.toBe(draftKey("life-event", 7));
  });

  it("round-trips a journal draft and clears it", () => {
    const s = memoryStorage();
    const key = draftKey("journal", 1);
    const d = { body: "Half a thought", mood: "high" as const, tags: "work" };
    saveDraft(key, d, s);
    expect(loadDraft(key, parseJournalDraft, s)).toEqual(d);
    clearDraft(key, s);
    expect(loadDraft(key, parseJournalDraft, s)).toBeNull();
  });

  it("survives a blocked or broken store", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => saveDraft("k", { body: "x" }, broken)).not.toThrow();
    expect(loadDraft("k", parseJournalDraft, broken)).toBeNull();
    expect(() => clearDraft("k", broken)).not.toThrow();
    expect(loadDraft("k", parseJournalDraft, null)).toBeNull();
  });

  it("ignores malformed JSON", () => {
    const s = memoryStorage();
    s.setItem("k", "{not json");
    expect(loadDraft("k", parseJournalDraft, s)).toBeNull();
  });
});

describe("parseJournalDraft", () => {
  it("drops an unknown mood and non-string fields", () => {
    expect(parseJournalDraft({ body: 3, mood: "ecstatic", tags: "a" })).toEqual({
      body: "",
      mood: null,
      tags: "a",
    });
    expect(parseJournalDraft([])).toBeNull();
  });

  it("counts whitespace as empty", () => {
    expect(isJournalDraftEmpty(EMPTY_JOURNAL_DRAFT)).toBe(true);
    expect(isJournalDraftEmpty({ body: "  \n", mood: null, tags: " " })).toBe(true);
    expect(isJournalDraftEmpty({ body: "", mood: "high", tags: "" })).toBe(false);
  });
});

describe("parseLifeEventDraft", () => {
  it("falls back to defaults for unknown enums", () => {
    expect(
      parseLifeEventDraft({
        title: "Moved",
        precision: "decade",
        category: "party",
        date: { day: "3", month: 4 },
        notes: "n",
      }),
    ).toEqual({
      title: "Moved",
      precision: "day",
      category: "other",
      date: { day: "3", month: "", year: "" },
      notes: "n",
    });
  });

  it("does not keep a draft that is only a precision or category pick", () => {
    expect(isLifeEventDraftEmpty(EMPTY_LIFE_EVENT_DRAFT)).toBe(true);
    expect(
      isLifeEventDraftEmpty({ ...EMPTY_LIFE_EVENT_DRAFT, precision: "year", category: "loss" }),
    ).toBe(true);
    expect(
      isLifeEventDraftEmpty({ ...EMPTY_LIFE_EVENT_DRAFT, date: { day: "", month: "", year: "1999" } }),
    ).toBe(false);
  });
});
