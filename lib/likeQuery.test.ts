import { describe, expect, it } from "vitest";
import { escapeLikePrefix } from "./likeQuery";

describe("escapeLikePrefix", () => {
  it("leaves plain strings unchanged", () => {
    expect(escapeLikePrefix("Tel Aviv")).toBe("Tel Aviv");
    expect(escapeLikePrefix("ירושלים")).toBe("ירושלים");
  });

  it("escapes percent", () => {
    expect(escapeLikePrefix("Te%")).toBe("Te\\%");
    expect(escapeLikePrefix("%%")).toBe("\\%\\%");
  });

  it("escapes underscore", () => {
    expect(escapeLikePrefix("T_")).toBe("T\\_");
  });

  it("escapes backslash itself", () => {
    expect(escapeLikePrefix("a\\b")).toBe("a\\\\b");
  });

  it("handles mixed input", () => {
    expect(escapeLikePrefix("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
