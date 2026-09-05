import { describe, expect, it } from "vitest";

import { mapFields } from "@/lib/tracking/fields";
import {
  parseEmail,
  parseRecordingUrl,
  parseMoneyCents,
  parseSheetDate,
  parseTrackingTab,
} from "@/lib/tracking/parse";
import { normalizeHeading, tabFromTitle } from "@/lib/tracking/tabs";

// Headers copied verbatim from the live sheets, which is the whole point:
// the two clients label the same tab differently.
const GRID_APPLICATIONS = [
  "Timestamp",
  "Submit Date",
  "First Name",
  "Email",
  "Phone",
  "Social Handle",
  "Q1: Type (Creator / Agency)",
  "Q2: Reach",
  "Q3: Goal",
  "Q4: Biggest Blocker",
  "Q5: Budget",
  "Q6: Timeline",
  "Lead Quality Tag",
  "CRM Lead ID",
  "Status",
  "Notes",
];
const RACKS_APPLICATIONS = [
  "Timestamp",
  "Submit Date",
  "First Name",
  "Email",
  "Phone",
  "Handle / Social",
  "Qualifier 1",
  "Qualifier 2 (biggest blocker)",
  "Goal",
  "Current Situation",
  "Budget / Capital",
  "Lead Quality Tag",
  "CRM Lead ID",
  "Status",
  "Notes",
];
const GRID_EOC = [
  "Timestamp",
  "Closer Name",
  "Call Date",
  "Call Time",
  "Booked or Live Transfer",
  "Lead's Email",
  "Lead Status Update",
  "Type of Lead",
  "Offer Pitched",
  "Cash Collected",
  "Revenue Generated",
  "Detailed Call Notes",
  "Call Recording Link",
];

describe("tabFromTitle", () => {
  it("reads the emoji tab titles the sheets actually use", () => {
    expect(tabFromTitle("📥 Applications")).toBe("applications");
    expect(tabFromTitle("📞 Calls Log")).toBe("calls");
    expect(tabFromTitle("💳 Payment Log")).toBe("payments");
    expect(tabFromTitle("🤝 New Deals")).toBe("deals");
    expect(tabFromTitle("🔥 Accounts Receivable")).toBe("ar");
    expect(tabFromTitle("🌅 BOD")).toBe("bod");
    expect(tabFromTitle("📝 EOC Reports")).toBe("eoc");
  });

  it("keeps DM Setter EOD separate from Setter EOD", () => {
    // They are different forms with different columns; collapsing them would
    // double-count a setter's day.
    expect(tabFromTitle("📱 DM Setter EOD")).toBe("dm_setter_eod");
    expect(tabFromTitle("📊 Setter EOD")).toBe("setter_eod");
    expect(tabFromTitle("📊 Closer EOD")).toBe("closer_eod");
  });

  it("returns null for tabs we do not mirror", () => {
    expect(tabFromTitle("📈 Dashboard")).toBeNull();
    expect(tabFromTitle("Scratch")).toBeNull();
  });

  it("normalizes emoji and spacing out of a heading", () => {
    expect(normalizeHeading("📝 EOC  Reports")).toBe("eoc reports");
  });
});

describe("mapFields", () => {
  it("maps The Grid's application headers", () => {
    const m = mapFields(GRID_APPLICATIONS);
    expect(m.email).toEqual([3]);
    expect(m.name).toEqual([2]);
    expect(m.phone).toEqual([4]);
    expect(m.status).toEqual([14]);
  });

  it("keeps BOTH date columns, preferred one first", () => {
    // Live data: The Grid's Applications tab has "Submit Date" (blank on 472
    // of 473 rows) and "Timestamp" (filled). Resolving to one column lost the
    // date almost everywhere; the reader needs the fallback.
    expect(mapFields(GRID_APPLICATIONS).occurredAt).toEqual([1, 0]);
  });

  it("maps RACKS' differently-worded headers to the same fields", () => {
    // The defect this prevents: by position, Racks' "Qualifier 1" sits where
    // The Grid keeps "Q1: Type", and its budget column is two places left.
    const m = mapFields(RACKS_APPLICATIONS);
    expect(m.email).toEqual([3]);
    expect(m.name).toEqual([2]);
    expect(m.status).toEqual([13]);
  });

  it("prefers the event date over the form-submission timestamp", () => {
    // "Timestamp" is when the rep filled the form; "Call Date" is when the
    // call happened. A day's numbers must key off the call.
    expect(mapFields(GRID_EOC).occurredAt[0]).toBe(2);
  });

  it("falls back to the timestamp when the event date is blank", () => {
    // The Grid's Calls Log: "Call Date" exists but is empty on all 109 rows.
    const headers = ["Timestamp", "Call Date", "First Name", "Email"];
    const { rows } = parseTrackingTab("calls", [
      headers,
      ["2026-07-30 13:19:22", "", "Lorenzo", "l@example.com"],
      ["2026-07-31 09:00:00", "2026-08-01", "Ana", "a@example.com"],
    ]);
    // Row 1 has only the timestamp; row 2 prefers its real call date.
    expect(rows[0].occurredAt?.getDate()).toBe(30);
    expect(rows[1].occurredAt?.getDate()).toBe(1);
  });

  it("finds the EOC recording link and the lead's email", () => {
    const m = mapFields(GRID_EOC);
    expect(m.recordingUrl).toEqual([12]);
    expect(m.email).toEqual([5]);
    expect(m.notes).toEqual([11]);
  });

  it("never lets two fields claim the same column", () => {
    const m = mapFields(["Closer Name", "Cash Collected"]);
    expect(m.rep).toEqual([0]);
    expect(m.name).toEqual([]);
  });

  it("leaves a field null when the sheet has no such column", () => {
    expect(mapFields(["Timestamp", "Notes"]).recordingUrl).toEqual([]);
  });
});

describe("parseMoneyCents", () => {
  it("reads the shapes sheets actually produce", () => {
    expect(parseMoneyCents("7500")).toBe(750000);
    expect(parseMoneyCents("$7,500.00")).toBe(750000);
    expect(parseMoneyCents("943.4")).toBe(94340);
    expect(parseMoneyCents("0")).toBe(0);
  });

  it("returns null — not zero — for anything unreadable", () => {
    // An unreadable tracking figure is unknown. Zero is a claim.
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("#ERROR!")).toBeNull();
    expect(parseMoneyCents("n/a")).toBeNull();
    expect(parseMoneyCents(null)).toBeNull();
  });

  it("rounds to the cent instead of carrying a float", () => {
    expect(parseMoneyCents("10.005")).toBe(1001);
    expect(parseMoneyCents("1234.567")).toBe(123457);
  });
});

describe("parseSheetDate", () => {
  it("reads every shape the live sheets mix", () => {
    expect(parseSheetDate("2026-08-03 16:53:39")?.getFullYear()).toBe(2026);
    expect(parseSheetDate("8/8/2026 9:52:48")?.getMonth()).toBe(7);
    expect(parseSheetDate("Jul 27 2026")?.getDate()).toBe(27);
    expect(parseSheetDate("2026-08-03")?.getDate()).toBe(3);
  });

  it("returns null rather than a wrong date", () => {
    expect(parseSheetDate("not a date")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("2026-02-31")).toBeNull();
    expect(parseSheetDate("13/45/2026")).toBeNull();
  });
});

describe("parseEmail", () => {
  it("lowercases a real address", () => {
    expect(parseEmail("  Lead@Example.COM ")).toBe("lead@example.com");
  });

  it("rejects the phone number that sits in the email column on some rows", () => {
    // Live data: a Grid Calls Log row has the email repeated in Phone, and
    // other rows have "#ERROR!" — neither is an address.
    expect(parseEmail("14434933761")).toBeNull();
    expect(parseEmail("#ERROR!")).toBeNull();
    expect(parseEmail("")).toBeNull();
  });
});

describe("parseTrackingTab", () => {
  it("promotes the known fields and keeps everything else in the payload", () => {
    const { rows, unmapped } = parseTrackingTab("eoc", [
      GRID_EOC,
      [
        "2026-08-03 20:27:09",
        "lorenzo saponara",
        "2026-08-03",
        "15:15",
        "Booked Call",
        "julian@gmail.com",
        "Follow Up — Strong Interest",
        "Business / Offer Owner",
        "The Grid — Operation Room",
        "0",
        "0",
        "Problem: new e-com store",
        "https://fathom.video/share/abc",
      ],
    ]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.email).toBe("julian@gmail.com");
    expect(r.rep).toBe("lorenzo saponara");
    expect(r.occurredAt?.getDate()).toBe(3);
    expect(r.cashCents).toBe(0);
    expect(r.recordingUrl).toBe("https://fathom.video/share/abc");
    expect(r.status).toBe("Follow Up — Strong Interest");
    // Unmapped columns survive verbatim rather than being dropped.
    expect(r.payload["Offer Pitched"]).toBe("The Grid — Operation Room");
    expect(r.payload["Type of Lead"]).toBe("Business / Offer Owner");
    expect(unmapped).toContain("Offer Pitched");
  });

  it("drops the thousand empty grid rows, keeps the real ones", () => {
    const { rows } = parseTrackingTab("applications", [
      GRID_APPLICATIONS,
      ["2026-07-28 4:59:50", "", "Daniel", "daniel@gmail.com"],
      [],
      ["", "", "", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Daniel");
  });

  it("numbers rows the way the sheet does, so a figure can be traced back", () => {
    const { rows } = parseTrackingTab("applications", [
      GRID_APPLICATIONS,
      ["2026-07-28 4:59:50", "", "First", "a@b.com"],
      ["2026-07-29 4:59:50", "", "Second", "c@d.com"],
    ]);
    expect(rows.map((r) => r.rowIndex)).toEqual([2, 3]);
  });

  it("treats #ERROR! cells as empty everywhere", () => {
    const { rows } = parseTrackingTab("ar", [
      ["Date Added", "Client Name", "Phone", "Amount Collected"],
      ["2026-08-19 16:35:01", "Connor", "#ERROR!", "2500"],
    ]);
    expect(rows[0].phone).toBeNull();
    expect(rows[0].payload["Phone"]).toBeUndefined();
    expect(rows[0].cashCents).toBe(250000);
  });

  it("handles a tab whose header row is missing entirely", () => {
    expect(parseTrackingTab("calls", []).rows).toEqual([]);
  });
});

describe("parseRecordingUrl", () => {
  it("keeps a real recording link", () => {
    expect(parseRecordingUrl("https://fathom.video/share/abc")).toBe(
      "https://fathom.video/share/abc",
    );
  });

  it("rejects the prose closers type into that column", () => {
    // Live EOC rows carry "na - cancelled 10 minutes before" here. Counting
    // those as recordings overstated the transcript queue.
    expect(parseRecordingUrl("na - cancelled 10 minutes before")).toBeNull();
    expect(parseRecordingUrl("n/a")).toBeNull();
    expect(parseRecordingUrl("")).toBeNull();
    expect(parseRecordingUrl(null)).toBeNull();
  });
});

describe("mapFields with learned aliases", () => {
  it("reads a column this app was never shipped knowing about", () => {
    // A new client names their own columns. Without a learned alias the
    // figure is kept but never counted, which looks like a quiet week.
    const headers = ["Date", "Assigned Rep", "Deal Owner"];
    // Shipped knowledge finds "Assigned Rep" and nothing else.
    expect(mapFields(headers).rep).toEqual([1]);
    // Taught that this client calls it "Deal Owner", that column is preferred
    // and the built-in match stays behind it as a fallback.
    const m = mapFields(headers, [{ header: "Deal Owner", field: "rep" }]);
    expect(m.rep[0]).toBe(2);
    expect(m.rep).toContain(1);
  });

  it("prefers what it was TAUGHT over a built-in guess", () => {
    // Both columns could be a date; the client says which one means the event.
    const headers = ["Timestamp", "Logged On"];
    const learned = [{ header: "Logged On", field: "occurredAt" as const }];
    expect(mapFields(headers, learned).occurredAt[0]).toBe(1);
  });

  it("ignores a learned alias for a column that is not on this sheet", () => {
    const headers = ["Timestamp", "Email"];
    const m = mapFields(headers, [{ header: "Nowhere To Be Seen", field: "cash" }]);
    expect(m.cash).toEqual([]);
    expect(m.email).toEqual([1]);
  });

  it("still resolves everything else normally", () => {
    const m = mapFields(GRID_EOC, [{ header: "Offer Pitched", field: "outcome" }]);
    expect(m.email).toEqual([5]);
    expect(m.recordingUrl).toEqual([12]);
    expect(m.outcome).toEqual([8]);
  });

  it("never lets a learned alias steal a column another field already took", () => {
    // Exclusive claiming still holds: one column, one meaning.
    const m = mapFields(
      ["Lead's Email", "Notes"],
      [
        { header: "Lead's Email", field: "email" },
        { header: "Lead's Email", field: "name" },
      ],
    );
    expect(m.email).toEqual([0]);
    expect(m.name).toEqual([]);
  });

  it("ignores a blank or unknown header safely", () => {
    expect(() =>
      mapFields(["", "Email"], [{ header: "  ", field: "cash" }]),
    ).not.toThrow();
  });
});
