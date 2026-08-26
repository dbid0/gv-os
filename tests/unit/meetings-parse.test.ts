import { describe, expect, it } from "vitest";

import {
  detectClient,
  matchMember,
  normalize,
  planTasks,
  type ClientRef,
  type RosterMember,
} from "@/lib/meetings/parse";

const MEMBERS: RosterMember[] = [
  { id: "m-daniel", name: "Daniel Bidros" },
  { id: "m-gus", name: "Gus" },
  { id: "m-cosmo", name: "Cosmo Rossi" },
  { id: "m-aymen", name: "Aymen" },
];

const CLIENTS: ClientRef[] = [
  { id: "c-grid", name: "The Grid", slug: "mbe", aliases: ["Grid", "Kaden"] },
  { id: "c-vault", name: "The Vault", slug: "brady", aliases: ["Vault", "Brady"] },
  { id: "c-racks", name: "Racks Closes", slug: "racks-closes", aliases: ["Racks"] },
];

describe("normalize", () => {
  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normalize("  Daniel B.  ")).toBe("daniel b");
    expect(normalize("Team (unassigned)")).toBe("team unassigned");
  });
});

describe("matchMember", () => {
  it("matches an exact full name", () => {
    expect(matchMember("Daniel Bidros", MEMBERS)).toBe("m-daniel");
  });

  it("matches a first name against a fuller roster name", () => {
    expect(matchMember("Cosmo", MEMBERS)).toBe("m-cosmo");
  });

  it("matches when the label carries a last initial", () => {
    expect(matchMember("Daniel B.", MEMBERS)).toBe("m-daniel");
  });

  it("returns null for group/sentinel labels", () => {
    expect(matchMember("Team (unassigned)", MEMBERS)).toBeNull();
    expect(matchMember("everyone", MEMBERS)).toBeNull();
  });

  it("returns null for an unknown person", () => {
    expect(matchMember("Some Guest", MEMBERS)).toBeNull();
  });
});

describe("detectClient", () => {
  it("detects a client by alias in the task text", () => {
    expect(detectClient("Rewrite the Vault VSL hook", CLIENTS)).toBe("c-vault");
  });

  it("detects a client by full name", () => {
    expect(detectClient("Ship The Grid webinar deck", CLIENTS)).toBe("c-grid");
  });

  it("returns null for an agency task naming no client", () => {
    expect(detectClient("Update the payout tracker", CLIENTS)).toBeNull();
  });

  it("does not false-match a client name embedded in a larger word", () => {
    // "gridlock" must not resolve to The Grid.
    expect(detectClient("Fix the gridlock in scheduling", CLIENTS)).toBeNull();
  });
});

describe("planTasks", () => {
  it("flattens items, resolving owner once and client per task", () => {
    const plan = planTasks(
      [
        { person: "Cosmo", tasks: ["Cut 3 Vault reels", "Refresh Grid thumbnails"] },
        { person: "Team (unassigned)", tasks: ["Book the offsite"] },
      ],
      MEMBERS,
      CLIENTS,
    );
    expect(plan).toEqual([
      {
        title: "Cut 3 Vault reels",
        assigneeId: "m-cosmo",
        person: "Cosmo",
        clientId: "c-vault",
      },
      {
        title: "Refresh Grid thumbnails",
        assigneeId: "m-cosmo",
        person: "Cosmo",
        clientId: "c-grid",
      },
      {
        title: "Book the offsite",
        assigneeId: null,
        person: "Team (unassigned)",
        clientId: null,
      },
    ]);
  });

  it("drops blank tasks and caps title length", () => {
    const long = "x".repeat(400);
    const plan = planTasks([{ person: "Gus", tasks: ["   ", long] }], MEMBERS, CLIENTS);
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toHaveLength(300);
    expect(plan[0].assigneeId).toBe("m-gus");
  });

  it("tolerates missing fields", () => {
    expect(planTasks([], MEMBERS, CLIENTS)).toEqual([]);
    expect(
      planTasks(
        [{ person: "Gus", tasks: undefined as unknown as string[] }],
        MEMBERS,
        CLIENTS,
      ),
    ).toEqual([]);
  });
});
