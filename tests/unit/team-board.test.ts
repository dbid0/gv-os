import { describe, expect, it } from "vitest";

import {
  salesTeamBoard,
  type TeamBoardInput,
  type TeamBoardTeam,
} from "@/lib/sales/team-board";

const TODAY = "2026-09-16";

const team = (over: Partial<TeamBoardTeam> = {}): TeamBoardTeam => ({
  id: "t1",
  slug: "client-north",
  name: "Client North",
  monthlyTargetCents: 1_000_000,
  ...over,
});

const input = (over: Partial<TeamBoardInput> = {}): TeamBoardInput => ({
  teams: [team()],
  cashBySlug: {},
  deals: [],
  eods: [],
  ...over,
});

describe("salesTeamBoard", () => {
  it("returns one row per team, in the order given", () => {
    const rows = salesTeamBoard(
      input({
        teams: [
          team({ id: "a", slug: "north", name: "North" }),
          team({ id: "b", slug: "south", name: "South" }),
        ],
      }),
      TODAY,
    );
    expect(rows.map((r) => r.name)).toEqual(["North", "South"]);
  });

  it("shows a dash, not $0, when cash could not be attributed", () => {
    // "Collected nothing" and "nothing could be matched to them" are different
    // sentences, and only one of them is about selling.
    const rows = salesTeamBoard(input({ cashBySlug: {} }), TODAY);
    expect(rows[0].cashCents).toBeNull();
  });

  it("shows an attributed zero as a real zero", () => {
    const rows = salesTeamBoard(input({ cashBySlug: { "client-north": 0 } }), TODAY);
    expect(rows[0].cashCents).toBe(0);
  });

  it("carries attributed cash through", () => {
    const rows = salesTeamBoard(
      input({ cashBySlug: { "client-north": 250_000 } }),
      TODAY,
    );
    expect(rows[0].cashCents).toBe(250_000);
  });

  it("treats a goal of 0 or null as no goal set", () => {
    expect(
      salesTeamBoard(input({ teams: [team({ monthlyTargetCents: 0 })] }), TODAY)[0]
        .goalCents,
    ).toBeNull();
    expect(
      salesTeamBoard(input({ teams: [team({ monthlyTargetCents: null })] }), TODAY)[0]
        .goalCents,
    ).toBeNull();
    expect(rowGoal(500_000)).toBe(500_000);
  });

  it("counts only this month's deals, and only this team's", () => {
    const rows = salesTeamBoard(
      input({
        teams: [team({ id: "a" }), team({ id: "b", slug: "s2", name: "Second" })],
        deals: [
          { clientId: "a", day: "2026-09-02" },
          { clientId: "a", day: "2026-09-30" },
          { clientId: "a", day: "2026-08-31" }, // last month
          { clientId: "b", day: "2026-09-10" }, // other team
        ],
      }),
      TODAY,
    );
    expect(rows[0].dealsThisMonth).toBe(2);
    expect(rows[1].dealsThisMonth).toBe(1);
  });

  it("counts today's EODs by team NAME, which is what reports store", () => {
    const rows = salesTeamBoard(
      input({
        eods: [
          { teamName: "Client North", day: TODAY },
          { teamName: "Client North", day: "2026-09-15" }, // yesterday
          { teamName: "Somebody Else", day: TODAY }, // other team
          { teamName: null, day: TODAY }, // unattached report
        ],
      }),
      TODAY,
    );
    expect(rows[0].eodsToday).toBe(1);
  });

  it("reads an empty agency as zeros and dashes, never as broken", () => {
    const rows = salesTeamBoard(input({ teams: [] }), TODAY);
    expect(rows).toEqual([]);
  });
});

/** Helper so the goal assertions read as one idea. */
function rowGoal(target: number | null) {
  return salesTeamBoard(
    {
      teams: [team({ monthlyTargetCents: target })],
      cashBySlug: {},
      deals: [],
      eods: [],
    },
    TODAY,
  )[0].goalCents;
}
