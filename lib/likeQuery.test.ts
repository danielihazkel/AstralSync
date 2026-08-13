import { describe, expect, it } from "vitest";
import { escapeLike } from "./likeQuery";

describe("escapeLike", () => {
  it("leaves plain strings unchanged", () => {
    expect(escapeLike("Tel Aviv")).toBe("Tel Aviv");
    expect(escapeLike("×™×¨×•×©×œ×™×")).toBe("×™×¨×•×©×œ×™×");
  });

  it("escapes percent", () => {
    expect(escapeLike("Te%")).toBe("Te\\%");
    expect(escapeLike("%%")).toBe("\\%\\%");
  });

  it("escapes underscore", () => {
    expect(escapeLike("T_")).toBe("T\\_");
  });

  it("escapes backslash itself", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("handles mixed input", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
