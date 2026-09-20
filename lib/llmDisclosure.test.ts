import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCLOSURE_POINTS,
  DISCLOSURE_VERSION,
  acknowledgeLlm,
  hasAcknowledgedLlm,
} from "./llmDisclosure";

/** Minimal localStorage stand-in — the suite runs in node, no DOM. */
function installStorage(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  const base: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, v),
  };
  vi.stubGlobal("window", { localStorage: { ...base, ...impl } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("llm disclosure", () => {
  it("has not been acknowledged on a fresh browser", () => {
    installStorage();
    expect(hasAcknowledgedLlm()).toBe(false);
  });

  it("remembers an acknowledgement", () => {
    installStorage();
    acknowledgeLlm();
    expect(hasAcknowledgedLlm()).toBe(true);
  });

  it("asks again when the disclosure version moves on", () => {
    installStorage();
    acknowledgeLlm();
    window.localStorage.setItem(
      "llm.disclosureAck",
      String(DISCLOSURE_VERSION - 1),
    );
    expect(hasAcknowledgedLlm()).toBe(false);
  });

  it("asks again rather than assuming consent when storage throws", () => {
    // Private mode: reading site data can throw outright. Failing closed
    // here would silently send birth data on the strength of a thrown
    // exception.
    installStorage({
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(hasAcknowledgedLlm()).toBe(false);
  });

  it("does not throw when the acknowledgement cannot be stored", () => {
    installStorage({
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => acknowledgeLlm()).not.toThrow();
  });

  it("names the three things that actually get sent", () => {
    // Guards against the disclosure drifting from lib/promptData's policy.
    expect(DISCLOSURE_POINTS.join(" ")).toMatch(/birth date, time and place/);
    expect(DISCLOSURE_POINTS.join(" ")).toMatch(/numerology/);
    expect(DISCLOSURE_POINTS.join(" ")).toMatch(/life events/);
  });
});
