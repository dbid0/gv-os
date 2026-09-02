import { describe, expect, it } from "vitest";

import {
  MATCH_WINDOW_MS,
  matchRecordingToCall,
  normalizeFathomRecording,
  type CallCandidate,
  type FathomRecording,
} from "@/lib/calls/fathom-normalize";

const AT = new Date("2026-09-01T17:00:00Z");

function rec(over: Partial<FathomRecording> = {}): FathomRecording {
  return {
    externalId: "rec_1",
    title: null,
    recordingUrl: null,
    transcript: null,
    summary: null,
    durationSeconds: null,
    occurredAt: AT,
    participants: [],
    ...over,
  };
}
function call(id: string, over: Partial<CallCandidate> = {}): CallCandidate {
  return { id, customerName: null, customerEmail: null, occurredAt: AT, ...over };
}

describe("normalizeFathomRecording", () => {
  it("normalises a typical payload", () => {
    const out = normalizeFathomRecording({
      id: "rec_42",
      title: "Discovery — Acme",
      share_url: "https://fathom.video/x",
      summary: "Prospect wants pricing.",
      duration: "1830",
      started_at: "2026-09-01T17:00:00Z",
      participants: [{ name: "Jane Doe" }, { email: "jane@acme.com" }, "Rep"],
    });
    expect(out).toMatchObject({
      externalId: "rec_42",
      title: "Discovery — Acme",
      recordingUrl: "https://fathom.video/x",
      durationSeconds: 1830,
    });
    expect(out?.participants).toEqual(["Jane Doe", "jane@acme.com", "Rep"]);
    expect(out?.occurredAt?.toISOString()).toBe("2026-09-01T17:00:00.000Z");
  });

  it("returns null without a stable id — otherwise re-import would duplicate", () => {
    expect(normalizeFathomRecording({ title: "no id" })).toBeNull();
    expect(normalizeFathomRecording(null)).toBeNull();
    expect(normalizeFathomRecording("nope")).toBeNull();
  });

  it("joins a segmented transcript into speaker lines", () => {
    const out = normalizeFathomRecording({
      id: "r",
      transcript: [
        { speaker: "Rep", text: "How's the operation?" },
        { speaker: "Prospect", text: "Got banned last month." },
      ],
    });
    expect(out?.transcript).toBe(
      "Rep: How's the operation?\nProspect: Got banned last month.",
    );
  });

  it("takes a plain-string transcript as-is", () => {
    expect(
      normalizeFathomRecording({ id: "r", transcript: "flat text" })?.transcript,
    ).toBe("flat text");
  });

  it("survives junk fields without throwing", () => {
    const out = normalizeFathomRecording({
      id: "r",
      duration: "abc",
      started_at: "nope",
      participants: 5,
    });
    expect(out).toMatchObject({
      externalId: "r",
      durationSeconds: null,
      occurredAt: null,
    });
    expect(out?.participants).toEqual([]);
  });
});

describe("matchRecordingToCall", () => {
  it("matches on the customer's EMAIL among participants", () => {
    const target = call("a", { customerEmail: "jane@acme.com" });
    const other = call("b", { customerEmail: "bob@other.com" });
    const got = matchRecordingToCall(rec({ participants: ["Jane <jane@acme.com>"] }), [
      target,
      other,
    ]);
    expect(got?.id).toBe("a");
  });

  it("matches on the customer's NAME in the title", () => {
    const got = matchRecordingToCall(rec({ title: "Close call — Jane Doe" }), [
      call("a", { customerName: "Jane Doe" }),
      call("b", { customerName: "Bob Smith" }),
    ]);
    expect(got?.id).toBe("a");
  });

  it("matches a LONE call in the window with no identity signal", () => {
    expect(matchRecordingToCall(rec(), [call("only")])?.id).toBe("only");
  });

  it("REFUSES to guess between two equally plausible calls", () => {
    // Two calls, same time, no identity signal — attaching the wrong transcript
    // would put one prospect's conversation on another's record.
    expect(matchRecordingToCall(rec(), [call("a"), call("b")])).toBeNull();
  });

  it("REFUSES when two candidates share the matched email", () => {
    const dupe = { customerEmail: "jane@acme.com" };
    expect(
      matchRecordingToCall(rec({ participants: ["jane@acme.com"] }), [
        call("a", dupe),
        call("b", dupe),
      ]),
    ).toBeNull();
  });

  it("ignores calls outside the time window", () => {
    const far = call("far", {
      occurredAt: new Date(AT.getTime() + MATCH_WINDOW_MS + 1000),
    });
    expect(matchRecordingToCall(rec(), [far])).toBeNull();
  });

  it("still matches at the edge of the window", () => {
    const edge = call("edge", { occurredAt: new Date(AT.getTime() + MATCH_WINDOW_MS) });
    expect(matchRecordingToCall(rec(), [edge])?.id).toBe("edge");
  });

  it("returns null with no candidates or no timestamp", () => {
    expect(matchRecordingToCall(rec(), [])).toBeNull();
    expect(matchRecordingToCall(rec({ occurredAt: null }), [call("a")])).toBeNull();
  });

  it("does not match on a uselessly short name", () => {
    // A 2-letter name would collide with almost any title.
    expect(
      matchRecordingToCall(rec({ title: "Jo's call" }), [
        call("a", { customerName: "Jo" }),
        call("b", { customerName: "Al" }),
      ]),
    ).toBeNull();
  });
});
