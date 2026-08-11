/**
 * Parser half of the dependency-free Markdown renderer (see Markdown.tsx).
 * Supports exactly the authoring subset from content/README.md — paragraphs,
 * "##" headings, **bold**, *italic*, and "- " lists. Everything else,
 * including raw HTML, stays literal text: the renderer builds React elements
 * from these structures and never touches innerHTML, so LLM-generated
 * Markdown is XSS-safe by construction.
 */

export interface InlineRun {
  style: "text" | "strong" | "em";
  text: string;
}

export type Block =
  | { type: "heading"; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "list"; items: InlineRun[][] };

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
    if (part === "") continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push({ style: "strong", text: part.slice(2, -2) });
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      runs.push({ style: "em", text: part.slice(1, -1) });
    } else {
      runs.push({ style: "text", text: part });
    }
  }
  return runs;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split(/\n\s*\n/)) {
    const chunk = raw.trim();
    if (chunk === "") continue;
    const lines = chunk.split("\n").map((l) => l.trim());

    if (lines.length === 1 && lines[0].startsWith("## ")) {
      blocks.push({ type: "heading", runs: parseInline(lines[0].slice(3)) });
    } else if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({
        type: "list",
        items: lines.map((l) => parseInline(l.slice(2))),
      });
    } else {
      blocks.push({ type: "paragraph", runs: parseInline(lines.join(" ")) });
    }
  }
  return blocks;
}
