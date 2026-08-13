import { describe, expect, it } from "vitest";
import { LineBuffer, sseData } from "./sse";

describe("LineBuffer", () => {
  it("reassembles lines split across chunks", () => {
    const buf = new LineBuffer();
    expect(buf.push("hel")).toEqual([]);
    expect(buf.push("lo\nwor")).toEqual(["hello"]);
    expect(buf.push("ld\n")).toEqual(["world"]);
    expect(buf.flush()).toBeNull();
  });

  it("strips carriage returns and flushes the remainder", () => {
    const buf = new LineBuffer();
    expect(buf.push("a\r\nb\r\ntail")).toEqual(["a", "b"]);
    expect(buf.flush()).toBe("tail");
    expect(buf.flush()).toBeNull();
  });

  it("handles multiple lines in one chunk and empty lines", () => {
    const buf = new LineBuffer();
    expect(buf.push("one\n\ntwo\n")).toEqual(["one", "", "two"]);
  });
});

describe("sseData", () => {
  it("extracts the payload with or without the conventional space", () => {
    expect(sseData("data: {\"x\":1}")).toBe('{"x":1}');
    expect(sseData("data:{\"x\":1}")).toBe('{"x":1}');
  });

  it("returns null for non-data lines", () => {
    expect(sseData("event: delta")).toBeNull();
    expect(sseData(": keep-alive")).toBeNull();
    expect(sseData("")).toBeNull();
  });

  it("keeps additional leading spaces beyond the first", () => {
    expect(sseData("data:  spaced")).toBe(" spaced");
  });
});
