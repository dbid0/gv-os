import { describe, expect, it } from "vitest";

import { matchToolId } from "@/lib/ai/router";

describe("ai free-text router", () => {
  it("returns null for empty or whitespace text", () => {
    expect(matchToolId("sales_rep", "")).toBeNull();
    expect(matchToolId("sales_rep", "   ")).toBeNull();
  });

  it("routes a rep's own questions to rep tools", () => {
    expect(matchToolId("sales_rep", "what's my streak?")).toBe("rep.streak");
    expect(matchToolId("sales_rep", "what am I owed")).toBe("rep.earnings");
    expect(matchToolId("sales_rep", "how am I pacing today")).toBe("rep.pacing");
    expect(matchToolId("sales_rep", "what do I need to hit quota")).toBe(
      "rep.quota_gap",
    );
    expect(matchToolId("sales_rep", "what's my close rate")).toBe("rep.conversion");
    expect(matchToolId("sales_rep", "when do I perform best")).toBe("rep.best_day");
  });

  it("routes manager + admin questions when the role permits", () => {
    expect(matchToolId("sales_manager", "who missed eod")).toBe("team.missed_eod");
    expect(matchToolId("sales_manager", "what's our close rate")).toBe(
      "team.close_rate",
    );
    expect(matchToolId("sales_manager", "who's my top rep")).toBe("team.standings");
    expect(matchToolId("admin", "who owes us money")).toBe("admin.outstanding_ar");
    expect(matchToolId("admin", "what did we net this month")).toBe("admin.net_month");
    expect(matchToolId("admin", "which clients are up or down")).toBe(
      "admin.client_trend",
    );
  });

  it("a rep's own 'my close rate' never collides with the team close-rate answer", () => {
    // First-person routes to the rep's own conversion...
    expect(matchToolId("sales_manager", "what's my close rate")).toBe("rep.conversion");
    // ...but a team-framed question still reaches the team answer.
    expect(matchToolId("sales_manager", "what's our close rate")).toBe(
      "team.close_rate",
    );
  });

  it("never routes a rep to an admin answer, even on matching keywords", () => {
    // "owes" would hit the admin AR rule, but a rep can't run it — so it falls
    // through to null rather than leaking agency data.
    expect(matchToolId("sales_rep", "who owes us money")).toBeNull();
    expect(matchToolId("sales_manager", "what did we net this month")).toBeNull();
  });

  it("returns null when nothing confidently matches", () => {
    expect(matchToolId("sales_rep", "hello there friend")).toBeNull();
    expect(matchToolId("admin", "tell me a joke")).toBeNull();
  });
});
