import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine, icsUtcStamp } from "./ics";

describe("icsUtcStamp", () => {
  it("converts ISO UTC instants to the RFC 5545 UTC form", () => {
    expect(icsUtcStamp("2026-08-14T12:30:00.000Z")).toBe("20260814T123000Z");
    expect(icsUtcStamp("2026-01-02T03:04:05.000Z")).toBe("20260102T030405Z");
  });

  it("keeps midnight and end-of-year boundaries in UTC", () => {
    expect(icsUtcStamp("2026-12-31T23:59:59.000Z")).toBe("20261231T235959Z");
    expect(icsUtcStamp("2027-01-01T00:00:00.000Z")).toBe("20270101T000000Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    expect(escapeIcsText("a;b,c")).toBe("a\\;b\\,c");
    expect(escapeIcsText("line one\nline two")).toBe("line one\\nline two");
    expect(escapeIcsText("crlf\r\nline")).toBe("crlf\\nline");
  });

  it("leaves plain text alone", () => {
    expect(escapeIcsText("Moon enters Leo")).toBe("Moon enters Leo");
  });
});

describe("foldIcsLine", () => {
  const octets = (s: string) => new TextEncoder().encode(s).length;

  it("leaves short lines unfolded", () => {
    expect(foldIcsLine("SUMMARY:Full Moon")).toBe("SUMMARY:Full Moon");
  });

  it("folds long lines at 75 octets with a space continuation", () => {
    const line = "DESCRIPTION:" + "x".repeat(200);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(octets(part)).toBeLessThanOrEqual(75);
    }
    for (const cont of parts.slice(1)) {
      expect(cont.startsWith(" ")).toBe(true);
    }
    // Unfolding (drop CRLF + one leading space) restores the original.
    expect(parts[0] + parts.slice(1).map((p) => p.slice(1)).join("")).toBe(line);
  });

  it("never splits a multi-byte character across a fold", () => {
    // 3-octet characters that never align with the 75-octet boundary.
    const line = "SUMMARY:" + "℞°→".repeat(40);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    for (const part of parts) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      // A split UTF-8 sequence would surface as a replacement char on decode;
      // re-joining must restore the original bytes exactly.
    }
    expect(parts[0] + parts.slice(1).map((p) => p.slice(1)).join("")).toBe(line);
  });
});

describe("buildIcs", () => {
  const dtStamp = "2026-08-14T00:00:00.000Z";

  it("produces a complete calendar with CRLF line endings", () => {
    const ics = buildIcs(
      [
        {
          uid: "quarter-20260808T000000Z",
          summary: "Full Moon",
          start: "2026-08-08T00:00:00.000Z",
        },
      ],
      { calName: "AstralSync sky", dtStamp },
    );
    expect(ics).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AstralSync//AstralSync//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:AstralSync sky",
        "BEGIN:VEVENT",
        "UID:quarter-20260808T000000Z@astralsync",
        "DTSTAMP:20260814T000000Z",
        "DTSTART:20260808T000000Z",
        "SUMMARY:Full Moon",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });

  it("emits DTEND only for windowed events", () => {
    const ics = buildIcs(
      [
        {
          uid: "voc-1",
          summary: "Void",
          start: "2026-08-08T00:00:00.000Z",
          end: "2026-08-08T04:30:00.000Z",
        },
        {
          uid: "ingress-1",
          summary: "Moon enters Leo",
          start: "2026-08-08T04:30:00.000Z",
        },
      ],
      { calName: "c", dtStamp },
    );
    expect(ics).toContain("DTEND:20260808T043000Z");
    expect(ics.match(/DTEND/g)).toHaveLength(1);
  });

  it("escapes text fields and includes descriptions", () => {
    const ics = buildIcs(
      [
        {
          uid: "e-1",
          summary: "Good window; score 4, maybe",
          description: "line one\nline two",
          start: "2026-08-08T00:00:00.000Z",
        },
      ],
      { calName: "a, b", dtStamp },
    );
    expect(ics).toContain("X-WR-CALNAME:a\\, b");
    expect(ics).toContain("SUMMARY:Good window\\; score 4\\, maybe");
    expect(ics).toContain("DESCRIPTION:line one\\nline two");
  });

  it("stamps every event with the injected DTSTAMP and uid suffix", () => {
    const ics = buildIcs(
      [
        { uid: "a", summary: "A", start: "2026-08-08T00:00:00.000Z" },
        { uid: "b", summary: "B", start: "2026-08-09T00:00:00.000Z" },
      ],
      { calName: "c", dtStamp },
    );
    expect(ics.match(/DTSTAMP:20260814T000000Z/g)).toHaveLength(2);
    expect(ics).toContain("UID:a@astralsync");
    expect(ics).toContain("UID:b@astralsync");
  });
});
