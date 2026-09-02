import { describe, expect, it } from "vitest";

import type { HomeIdentity } from "@/lib/home/identity";
import {
  applyPreview,
  scopeRowsToViewer,
  seesEveryOffer,
  viewerLaneClientId,
  visibleClientIds,
} from "@/lib/home/visibility";

const GRID = "client-grid";
const VAULT = "client-vault";
const ACTIVE = [GRID, VAULT, "client-racks"];

function who(over: Partial<HomeIdentity> = {}): HomeIdentity {
  return {
    platformRole: null,
    member: null,
    repId: null,
    managerClientId: null,
    ...over,
  } as HomeIdentity;
}
const member = (clientId: string | null) =>
  ({
    id: "m",
    name: "R",
    role: "closer",
    roleKey: null,
    repKind: null,
    email: null,
    status: "active",
    clientId,
    clientName: null,
    repId: null,
  }) as HomeIdentity["member"];

describe("visibleClientIds", () => {
  it("gives an ADMIN the whole book", () => {
    expect(visibleClientIds(who({ platformRole: "admin" }), ACTIVE)).toBeNull();
  });

  it("gives an UNMAPPED owner (daniel@ / gus@) the whole book", () => {
    expect(visibleClientIds(who(), ACTIVE)).toBeNull();
  });

  it("scopes a SALES REP to their own lane only", () => {
    const rep = who({ platformRole: "sales_rep", member: member(GRID) });
    expect(visibleClientIds(rep, ACTIVE)).toEqual([GRID]);
  });

  it("scopes a TEAM MEMBER to their own lane only", () => {
    const vа = who({ platformRole: "team_member", member: member(VAULT) });
    expect(visibleClientIds(vа, ACTIVE)).toEqual([VAULT]);
  });

  it("scopes a LANE-PINNED manager, but lets an agency-wide one see all", () => {
    const pinned = who({ platformRole: "sales_manager", managerClientId: VAULT });
    expect(visibleClientIds(pinned, ACTIVE)).toEqual([VAULT]);
    const agencyWide = who({ platformRole: "sales_manager" });
    expect(visibleClientIds(agencyWide, ACTIVE)).toBeNull();
  });

  it("shows a rep with NO lane NOTHING — never everything", () => {
    // The exposure being closed: a missing lane is a data gap, and defaulting a
    // data gap to "every client's book" is exactly the bug.
    const laneless = who({ platformRole: "sales_rep", member: member(null) });
    expect(visibleClientIds(laneless, ACTIVE)).toEqual([]);
  });

  it("never returns an offer that is not active", () => {
    const rep = who({ platformRole: "sales_rep", member: member("archived-client") });
    expect(visibleClientIds(rep, ACTIVE)).toEqual([]);
  });

  it("prefers the manager lane over the roster row when both exist", () => {
    const both = who({
      platformRole: "sales_manager",
      managerClientId: GRID,
      member: member(VAULT),
    });
    expect(viewerLaneClientId(both)).toBe(GRID);
    expect(visibleClientIds(both, ACTIVE)).toEqual([GRID]);
  });
});

describe("seesEveryOffer", () => {
  it("is true only for unrestricted viewers", () => {
    expect(seesEveryOffer(who({ platformRole: "admin" }), ACTIVE)).toBe(true);
    expect(seesEveryOffer(who(), ACTIVE)).toBe(true);
    expect(
      seesEveryOffer(who({ platformRole: "sales_rep", member: member(GRID) }), ACTIVE),
    ).toBe(false);
  });
});

describe("scopeRowsToViewer", () => {
  const rows = [
    { id: 1, clientId: GRID },
    { id: 2, clientId: VAULT },
    { id: 3, clientId: null },
  ];
  const of = (r: (typeof rows)[number]) => r.clientId;

  it("passes everything through when unrestricted", () => {
    expect(scopeRowsToViewer(rows, of, null)).toHaveLength(3);
  });

  it("keeps only the viewer's own rows", () => {
    expect(scopeRowsToViewer(rows, of, [GRID]).map((r) => r.id)).toEqual([1]);
  });

  it("DROPS rows with no client for a scoped viewer", () => {
    // An untagged row could belong to any offer — showing it would leak by
    // accident, which is worse than omitting it.
    expect(scopeRowsToViewer(rows, of, [GRID, VAULT]).map((r) => r.id)).toEqual([1, 2]);
  });

  it("returns nothing when the viewer is allowed nothing", () => {
    expect(scopeRowsToViewer(rows, of, [])).toEqual([]);
  });
});

describe("applyPreview (View as)", () => {
  const owner = who({ platformRole: null });
  const rep = who({ platformRole: "sales_rep", member: member(GRID) });

  it("narrows an OWNER to the previewed role and lane", () => {
    const out = applyPreview(owner, "sales_rep", GRID);
    expect(out.platformRole).toBe("sales_rep");
    expect(visibleClientIds(out, [GRID, VAULT])).toEqual([GRID]);
  });

  it("previewing a rep with NO lane shows nothing, never everything", () => {
    const out = applyPreview(owner, "sales_rep", null);
    expect(visibleClientIds(out, [GRID, VAULT])).toEqual([]);
  });

  it("IGNORES the preview for a real rep — a cookie cannot widen a seat", () => {
    // A forged gv-dev-role=admin on a real rep must change nothing.
    expect(applyPreview(rep, "admin", null)).toBe(rep);
    expect(visibleClientIds(applyPreview(rep, "admin", null), [GRID, VAULT])).toEqual([
      GRID,
    ]);
  });

  it("IGNORES a preview lane for a real rep who has no lane", () => {
    const laneless = who({ platformRole: "sales_rep" });
    expect(
      visibleClientIds(applyPreview(laneless, null, VAULT), [GRID, VAULT]),
    ).toEqual([]);
  });

  it("is a no-op with no previewed role", () => {
    expect(applyPreview(owner, null, GRID)).toBe(owner);
    expect(visibleClientIds(applyPreview(owner, null, GRID), [GRID, VAULT])).toBeNull();
  });

  it("previews an agency-wide manager as the whole book, a laned one as their lane", () => {
    expect(
      visibleClientIds(applyPreview(owner, "sales_manager", null), [GRID, VAULT]),
    ).toBeNull();
    expect(
      visibleClientIds(applyPreview(owner, "sales_manager", VAULT), [GRID, VAULT]),
    ).toEqual([VAULT]);
  });
});
