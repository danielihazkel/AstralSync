import type { ReactNode } from "react";
import { parseMarkdown, type InlineRun } from "./markdown-parser";

/**
 * Renders the content library's Markdown subset (content/README.md) as React
 * elements built from text nodes — no innerHTML anywhere, so untrusted input
 * (LLM output included) cannot inject markup.
 */

function runs(list: InlineRun[]): ReactNode {
  return list.map((run, i) => {
    if (run.style === "strong") return <strong key={i}>{run.text}</strong>;
    if (run.style === "em") return <em key={i}>{run.text}</em>;
    return run.text;
  });
}

export default function Markdown({ md }: { md: string }) {
  return (
    <>
      {parseMarkdown(md).map((block, i) => {
        if (block.type === "heading") return <h4 key={i}>{runs(block.runs)}</h4>;
        if (block.type === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{runs(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{runs(block.runs)}</p>;
      })}
    </>
  );
}
