import { describe, expect, it } from "vitest";

import { leadStatusTone } from "@/lib/tracking/lead-status";

describe("leadStatusTone", () => {
  it("reads money words as success", () => {
    expect(leadStatusTone("succeeded")).toBe("success");
    expect(leadStatusTone("Paid in full")).toBe("success");
  });

  it("reads progress words as brand", () => {
    expect(leadStatusTone("closer follow up")).toBe("brand");
    expect(leadStatusTone("Webinar Lead")).toBe("brand");
    expect(leadStatusTone("call booked")).toBe("brand");
  });

  it("reads stall words as warning", () => {
    expect(leadStatusTone("no show")).toBe("warning");
    expect(leadStatusTone("Cancelled")).toBe("warning");
  });

  it("reads dead words as danger — dq only as the WHOLE word", () => {
    expect(leadStatusTone("dq")).toBe("danger");
    expect(leadStatusTone("disqualified")).toBe("danger");
    expect(leadStatusTone("refunded")).toBe("danger");
    // "dq" inside another word must not match…
    expect(leadStatusTone("hq review")).toBe("neutral");
  });

  it("leaves unknown wording neutral rather than guessing", () => {
    expect(leadStatusTone("waiting on paperwork")).toBe("neutral");
    expect(leadStatusTone(null)).toBe("neutral");
    expect(leadStatusTone("")).toBe("neutral");
  });
});
