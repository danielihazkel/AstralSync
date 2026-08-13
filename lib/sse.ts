/**
 * Dependency-free incremental line/SSE parsing, shared by the streaming LLM
 * clients (lib/llm.ts) and unit-testable in isolation. Chunks from a network
 * stream split lines arbitrarily; these helpers reassemble them.
 */

/** Reassembles complete lines from arbitrarily-split chunks. */
export class LineBuffer {
  private buf = "";

  /** Feed a decoded chunk; returns the complete lines it finished. */
  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    return lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  }

  /** The unterminated remainder, if any (call once at stream end). */
  flush(): string | null {
    const rest = this.buf;
    this.buf = "";
    return rest === "" ? null : rest;
  }
}

/**
 * The data payload of an SSE `data:` line, or null for anything else
 * (event names, comments, blank separators). Multi-line data fields are not
 * needed for the OpenAI/Anthropic dialects — each data line is one JSON
 * document.
 */
export function sseData(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5);
  return payload.startsWith(" ") ? payload.slice(1) : payload;
}
