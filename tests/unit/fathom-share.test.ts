import { describe, expect, it } from "vitest";

import {
  callIdFrom,
  copyTranscriptUrlFrom,
  parseDuration,
  parseShareToken,
  parseTranscriptPayload,
} from "@/lib/calls/fathom-share";

// The exact spellings that appear in The Grid's EOC column and on the live
// share page.
const SHARE = "https://fathom.video/share/Fqe16qBxRD2au6iZqRzprXsB4VF9gJLx";
const COPY =
  "https://fathom.video/calls/803889913/copy_transcript?token=Fqe16qBxRD2au6iZqRzprXsB4VF9gJLx";

describe("parseShareToken", () => {
  it("reads the token from a real share link", () => {
    expect(parseShareToken(SHARE)).toBe("Fqe16qBxRD2au6iZqRzprXsB4VF9gJLx");
  });

  it("rejects what closers actually type when there is no recording", () => {
    // Live EOC rows carry "na", "n/a" and prose in this column.
    expect(parseShareToken("na")).toBeNull();
    expect(parseShareToken("na - cancelled 10 minutes before")).toBeNull();
    expect(parseShareToken("")).toBeNull();
    expect(parseShareToken(null)).toBeNull();
  });

  it("does not accept a look-alike host", () => {
    expect(parseShareToken("https://fathom.video.evil.com/share/abcdefgh")).toBeNull();
    expect(parseShareToken("https://notfathom.video/share/abcdefgh")).toBeNull();
  });

  it("accepts the www form and ignores surrounding space", () => {
    expect(parseShareToken("  https://www.fathom.video/share/abcdefgh12  ")).toBe(
      "abcdefgh12",
    );
  });
});

describe("copyTranscriptUrlFrom", () => {
  it("finds the endpoint the share page embeds as escaped JSON", () => {
    const page = `x&quot;copyTranscriptUrl&quot;:&quot;${COPY.replace(/&/g, "&amp;")}&quot;,&quot;next`;
    expect(copyTranscriptUrlFrom(page)).toBe(COPY);
  });

  it("also reads it unescaped", () => {
    expect(copyTranscriptUrlFrom(`{"copyTranscriptUrl":"${COPY}"}`)).toBe(COPY);
  });

  it("returns null rather than guessing an endpoint", () => {
    // If Fathom changes the page this must fail visibly, not invent a URL.
    expect(copyTranscriptUrlFrom("<html>no transcript here</html>")).toBeNull();
  });
});

describe("callIdFrom", () => {
  it("reads the call id", () => {
    expect(callIdFrom(COPY)).toBe("803889913");
  });

  it("is null when the URL has no call id", () => {
    expect(callIdFrom("https://fathom.video/share/abc")).toBeNull();
  });
});

describe("parseTranscriptPayload", () => {
  const plain =
    "(YA) Louie Pablo | AI Strategy Call - September 02\n" +
    "VIEW RECORDING - 52 mins (No highlights): \n\n---\n\n" +
    "0:00 - Maximilian Pablo\n  All good, good stuff.\n\n" +
    "0:11 - lorenzo s\n  Whereabouts are you based?";

  it("prefers the plain-text rendering and keeps the speakers", () => {
    const out = parseTranscriptPayload({ plain_text: plain, html: "<p>ignored</p>" });
    expect(out?.text).toContain("Maximilian Pablo");
    expect(out?.text).toContain("Whereabouts are you based?");
    expect(out?.title).toBe("(YA) Louie Pablo | AI Strategy Call - September 02");
    expect(out?.durationSeconds).toBe(52 * 60);
  });

  it("falls back to the HTML rendering", () => {
    const out = parseTranscriptPayload({
      html: "<h1>Call title</h1><br /><p><b>Rep</b></p><p>Hello there</p>",
    });
    expect(out?.title).toBe("Call title");
    expect(out?.text).toContain("Hello there");
  });

  it("returns null instead of storing an empty transcript", () => {
    // An empty transcript saved as if it were the call reads as a silent meeting.
    expect(parseTranscriptPayload({ plain_text: "   ", html: "" })).toBeNull();
    expect(parseTranscriptPayload({})).toBeNull();
    expect(parseTranscriptPayload(null)).toBeNull();
    expect(parseTranscriptPayload("not an object")).toBeNull();
  });
});

describe("parseDuration", () => {
  it("reads minutes and hours from the header", () => {
    expect(parseDuration("VIEW RECORDING - 52 mins")).toBe(3120);
    expect(parseDuration("VIEW RECORDING - 2 hours")).toBe(7200);
  });

  it("is null when the header does not say", () => {
    expect(parseDuration("VIEW RECORDING")).toBeNull();
    expect(parseDuration("0:00 - speaker")).toBeNull();
  });
});
