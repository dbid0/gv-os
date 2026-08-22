import { describe, expect, it } from "vitest";

import {
  isCompletedDoc,
  normalizePandaDoc,
  normalizeTypeformResponse,
} from "@/lib/docs/normalize";

describe("normalizePandaDoc", () => {
  it("extracts the completed-doc essentials", () => {
    const out = normalizePandaDoc({
      id: "doc_ABC",
      name: "The Grid Agreement — Jane Buyer",
      status: "document.completed",
      date_completed: "2026-08-20T18:00:00Z",
      recipients: [{ email: "jane@buyer.com" }],
    });
    expect(out).toEqual({
      externalId: "doc_ABC",
      name: "The Grid Agreement — Jane Buyer",
      docStatus: "document.completed",
      recipientEmail: "jane@buyer.com",
      completedAt: "2026-08-20T18:00:00Z",
    });
    expect(isCompletedDoc(out!)).toBe(true);
  });

  it("keeps drafts parseable but filterable, rejects id-less docs", () => {
    const draft = normalizePandaDoc({ id: "d2", status: "document.draft" });
    expect(isCompletedDoc(draft!)).toBe(false);
    expect(normalizePandaDoc({ status: "document.completed" })).toBeNull();
  });

  it("falls back to date_modified and tolerates missing recipients", () => {
    const out = normalizePandaDoc({
      id: "d3",
      status: "document.completed",
      date_modified: "2026-08-19T10:00:00Z",
    });
    expect(out?.completedAt).toBe("2026-08-19T10:00:00Z");
    expect(out?.recipientEmail).toBeNull();
  });
});

describe("normalizeTypeformResponse", () => {
  it("lifts email + first text answer as the join keys", () => {
    const out = normalizeTypeformResponse({
      response_id: "resp_1",
      submitted_at: "2026-08-21T02:00:00Z",
      answers: [
        { type: "text", text: "Jane Applicant" },
        { type: "email", email: "jane@lead.com" },
        { type: "choice", choice: { label: "$5k-$10k" } },
      ],
    });
    expect(out).toEqual({
      externalId: "resp_1",
      email: "jane@lead.com",
      name: "Jane Applicant",
      submittedAt: "2026-08-21T02:00:00Z",
    });
  });

  it("uses token as a fallback id and rejects id-less responses", () => {
    expect(normalizeTypeformResponse({ token: "tok_9" })?.externalId).toBe("tok_9");
    expect(normalizeTypeformResponse({ answers: [] })).toBeNull();
  });
});
