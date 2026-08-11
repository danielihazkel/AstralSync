import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown-parser";

describe("parseInline", () => {
  it("splits bold and italic runs", () => {
    expect(parseInline("plain **bold** and *soft* end")).toEqual([
      { style: "text", text: "plain " },
      { style: "strong", text: "bold" },
      { style: "text", text: " and " },
      { style: "em", text: "soft" },
      { style: "text", text: " end" },
    ]);
  });

  it("leaves unpaired asterisks as text", () => {
    expect(parseInline("a * b")).toEqual([{ style: "text", text: "a * b" }]);
  });
});

describe("parseMarkdown", () => {
  it("parses paragraphs, headings, and lists", () => {
    const md = "## Head\n\nPara one\ncontinued.\n\n- first\n- **second**";
    expect(parseMarkdown(md)).toEqual([
      { type: "heading", runs: [{ style: "text", text: "Head" }] },
      { type: "paragraph", runs: [{ style: "text", text: "Para one continued." }] },
      {
        type: "list",
        items: [
          [{ style: "text", text: "first" }],
          [{ style: "strong", text: "second" }],
        ],
      },
    ]);
  });

  it("ignores extra blank lines", () => {
    expect(parseMarkdown("\n\nOne.\n\n\n\nTwo.\n\n")).toHaveLength(2);
  });

  it("keeps hostile input inert as literal text", () => {
    const blocks = parseMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> &lt;b&gt;',
    );
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [{ style: "text", text: "<script>alert(1)</script>" }],
      },
      {
        type: "paragraph",
        runs: [{ style: "text", text: "<img src=x onerror=alert(1)> &lt;b&gt;" }],
      },
    ]);
  });

  it("treats a heading mid-chunk as paragraph text, not a heading", () => {
    const blocks = parseMarkdown("## Real heading\nwith a second line");
    expect(blocks[0].type).toBe("paragraph");
  });
});
