import { describe, expect, it } from "vitest";

import { parseIcs } from "@/lib/calendar/ics";

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-10-31T23:59:59Z");

const wrap = (body: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", body, "END:VCALENDAR"].join("\r\n");

const event = (lines: string[]) =>
  wrap(["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n"));

const parse = (text: string, from = FROM, to = TO) => parseIcs(text, from, to);

const iso = (d: Date) => d.toISOString();

describe("parseIcs — one event", () => {
  it("reads a timed event's start, end and summary", () => {
    const cal = parse(
      event([
        "UID:abc@google.com",
        "SUMMARY:Closer call",
        "DTSTART:20260917T140000Z",
        "DTEND:20260917T150000Z",
      ]),
    );
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0]).toMatchObject({
      uid: "abc@google.com",
      summary: "Closer call",
      allDay: false,
    });
    expect(iso(cal.events[0].start)).toBe("2026-09-17T14:00:00.000Z");
    expect(iso(cal.events[0].end!)).toBe("2026-09-17T15:00:00.000Z");
  });

  it("reads a DATE value as an all-day event", () => {
    const cal = parse(
      event(["UID:x", "SUMMARY:Offsite", "DTSTART;VALUE=DATE:20260918"]),
    );
    expect(cal.events[0]).toMatchObject({ allDay: true, end: null });
    expect(iso(cal.events[0].start)).toBe("2026-09-18T00:00:00.000Z");
  });

  it("gives an event with no end a null end rather than guessing one", () => {
    const cal = parse(event(["UID:x", "SUMMARY:Hold", "DTSTART:20260917T140000Z"]));
    expect(cal.events[0].end).toBeNull();
  });

  it("keeps an event with no summary rather than dropping it", () => {
    // A blocked hour with no title is still a blocked hour.
    const cal = parse(event(["UID:x", "DTSTART:20260917T140000Z"]));
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0].summary).toBeNull();
  });

  it("drops a cancelled event", () => {
    const cal = parse(
      event([
        "UID:x",
        "SUMMARY:Called off",
        "STATUS:CANCELLED",
        "DTSTART:20260917T140000Z",
      ]),
    );
    expect(cal.events).toEqual([]);
  });

  it("drops an event with no start — it cannot be placed on a day", () => {
    expect(parse(event(["UID:x", "SUMMARY:Someday"])).events).toEqual([]);
  });

  it("drops an event whose start will not parse", () => {
    expect(
      parse(event(["UID:x", "SUMMARY:Broken", "DTSTART:not-a-date"])).events,
    ).toEqual([]);
  });

  it("leaves out an event outside the window", () => {
    expect(
      parse(event(["UID:x", "SUMMARY:Last year", "DTSTART:20250101T140000Z"])).events,
    ).toEqual([]);
  });

  it("unfolds a summary split across lines", () => {
    const text = wrap(
      [
        "BEGIN:VEVENT",
        "UID:x",
        "SUMMARY:A very long meeting title that Google ",
        " wrapped onto a second line",
        "DTSTART:20260917T140000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parse(text).events[0].summary).toBe(
      "A very long meeting title that Google wrapped onto a second line",
    );
  });

  it("unescapes commas, semicolons and newlines in a summary", () => {
    const cal = parse(
      event([
        "UID:x",
        "SUMMARY:Call with Kaden\\, Gus\\; then notes",
        "DTSTART:20260917T140000Z",
      ]),
    );
    expect(cal.events[0].summary).toBe("Call with Kaden, Gus; then notes");
  });

  it("ignores an alarm's own start inside the event", () => {
    // A VALARM carries a TRIGGER and sometimes its own props; the event's
    // DTSTART must win.
    const text = wrap(
      [
        "BEGIN:VEVENT",
        "UID:x",
        "SUMMARY:Real meeting",
        "DTSTART:20260917T140000Z",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DTSTART:20260101T000000Z",
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const cal = parse(text);
    expect(cal.events).toHaveLength(1);
    expect(iso(cal.events[0].start)).toBe("2026-09-17T14:00:00.000Z");
  });

  it("ignores non-event components entirely", () => {
    const text = wrap(
      [
        "BEGIN:VTIMEZONE",
        "TZID:America/Chicago",
        "DTSTART:19700308T020000",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:x",
        "SUMMARY:Only me",
        "DTSTART:20260917T140000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const cal = parse(text);
    expect(cal.events.map((e) => e.summary)).toEqual(["Only me"]);
  });

  it("reads an empty calendar as empty, not as broken", () => {
    expect(parse(wrap(""))).toEqual({ events: [], unexpandedSeries: 0 });
  });

  it("ignores a line with no colon", () => {
    const text = wrap(
      [
        "BEGIN:VEVENT",
        "GARBAGE",
        "UID:x",
        "DTSTART:20260917T140000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parse(text).events).toHaveLength(1);
  });

  it("returns events in time order whatever order the file used", () => {
    const text = wrap(
      [
        "BEGIN:VEVENT",
        "UID:b",
        "SUMMARY:Later",
        "DTSTART:20260920T140000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:a",
        "SUMMARY:Earlier",
        "DTSTART:20260918T140000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parse(text).events.map((e) => e.summary)).toEqual(["Earlier", "Later"]);
  });
});

describe("parseIcs — repeats", () => {
  it("expands a daily rule across the window", () => {
    const cal = parse(
      event([
        "UID:d",
        "SUMMARY:Daily standup",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start))).toEqual([
      "2026-09-01T14:00:00.000Z",
      "2026-09-02T14:00:00.000Z",
      "2026-09-03T14:00:00.000Z",
    ]);
  });

  it("honours INTERVAL", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;INTERVAL=3;COUNT=3",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-04",
      "2026-09-07",
    ]);
  });

  it("stops at UNTIL", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;UNTIL=20260903T140000Z",
      ]),
    );
    expect(cal.events).toHaveLength(3);
  });

  it("expands a weekly rule on the start's own weekday when BYDAY is absent", () => {
    // 2026-09-01 is a Tuesday.
    const cal = parse(
      event(["UID:w", "DTSTART:20260901T140000Z", "RRULE:FREQ=WEEKLY;COUNT=3"]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
    ]);
  });

  it("expands BYDAY across each week", () => {
    const cal = parse(
      event([
        "UID:w",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
    ]);
  });

  it("never produces an occurrence before the series began", () => {
    // Start is a Wednesday but the rule also names Monday; that week's Monday
    // is before the series exists.
    const cal = parse(
      event([
        "UID:w",
        "DTSTART:20260902T140000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-02",
      "2026-09-07",
      "2026-09-09",
    ]);
  });

  it("expands a monthly rule", () => {
    const cal = parse(
      event(["UID:m", "DTSTART:20260905T140000Z", "RRULE:FREQ=MONTHLY;COUNT=2"]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-05",
      "2026-10-05",
    ]);
  });

  it("carries the event's length onto every repeat", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "DTEND:20260901T143000Z",
        "RRULE:FREQ=DAILY;COUNT=2",
      ]),
    );
    for (const e of cal.events) {
      expect(e.end!.getTime() - e.start.getTime()).toBe(30 * 60 * 1000);
    }
  });

  it("drops an instance deleted from the series", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE:20260902T140000Z",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-03",
    ]);
  });

  it("drops several deleted instances listed on one line", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE:20260902T140000Z,20260903T140000Z",
      ]),
    );
    expect(cal.events).toHaveLength(2);
  });

  it("clips a long series to the window instead of walking forever", () => {
    const cal = parse(
      event(["UID:d", "DTSTART:20260901T140000Z", "RRULE:FREQ=DAILY"]),
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-07T23:59:59Z"),
    );
    expect(cal.events).toHaveLength(7);
  });

  it("counts a rule it cannot expand and keeps the first occurrence", () => {
    // Silence would make a real recurring meeting vanish from the calendar.
    const cal = parse(
      event([
        "UID:y",
        "SUMMARY:Annual review",
        "DTSTART:20260905T140000Z",
        "RRULE:FREQ=YEARLY",
      ]),
    );
    expect(cal.unexpandedSeries).toBe(1);
    expect(cal.events.map((e) => e.summary)).toEqual(["Annual review"]);
  });

  it("counts an unreadable rule the same way", () => {
    const cal = parse(event(["UID:y", "DTSTART:20260905T140000Z", "RRULE:NONSENSE=1"]));
    expect(cal.unexpandedSeries).toBe(1);
    expect(cal.events).toHaveLength(1);
  });

  it("does not keep an unexpandable series that starts outside the window", () => {
    const cal = parse(
      event(["UID:y", "DTSTART:20200905T140000Z", "RRULE:FREQ=YEARLY"]),
    );
    expect(cal.unexpandedSeries).toBe(1);
    expect(cal.events).toEqual([]);
  });

  it("treats a zero or negative INTERVAL as 1 rather than stepping nowhere", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;INTERVAL=0;COUNT=2",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("ignores a COUNT that is not a positive number", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=nope;UNTIL=20260903T140000Z",
      ]),
    );
    expect(cal.events).toHaveLength(3);
  });

  it("reads a floating local time as UTC", () => {
    // GV OS places items by day; a resolved-zone guess we cannot verify would
    // be a confident wrong answer rather than a small one.
    const cal = parse(
      event([
        "UID:f",
        "DTSTART;TZID=America/Chicago:20260917T090000",
        "SUMMARY:Local time",
      ]),
    );
    expect(iso(cal.events[0].start)).toBe("2026-09-17T09:00:00.000Z");
  });
});

describe("parseIcs — the awkward edges", () => {
  it("clips an unbounded weekly series to the window", () => {
    const cal = parse(
      event(["UID:w", "DTSTART:20260901T140000Z", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH"]),
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-11T23:59:59Z"),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
    ]);
  });

  it("stops a weekly series mid-week when UNTIL falls inside it", () => {
    const cal = parse(
      event([
        "UID:w",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260909T000000Z",
      ]),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
    ]);
  });

  it("clips an unbounded monthly series to the window", () => {
    const cal = parse(
      event(["UID:m", "DTSTART:20260905T140000Z", "RRULE:FREQ=MONTHLY"]),
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-11-30T23:59:59Z"),
    );
    expect(cal.events).toHaveLength(3);
  });

  it("stops a monthly series at COUNT", () => {
    const cal = parse(
      event(["UID:m", "DTSTART:20260905T140000Z", "RRULE:FREQ=MONTHLY;COUNT=1"]),
    );
    expect(cal.events).toHaveLength(1);
  });

  it("keeps an event with no UID rather than dropping it", () => {
    // Every real calendar writes one, but a missing UID is not a reason to
    // hide a meeting from the person whose day it is on.
    const cal = parse(event(["SUMMARY:No id", "DTSTART:20260917T140000Z"]));
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0].uid).toBe("");
  });

  it("ignores an EXDATE it cannot read instead of failing the event", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=2",
        "EXDATE:garbage",
      ]),
    );
    expect(cal.events).toHaveLength(2);
  });
});

describe("parseIcs — malformed input never takes the calendar down", () => {
  it("ignores a parameter with no value", () => {
    const cal = parse(
      event(["UID:x", "DTSTART;BROKEN;VALUE=DATE:20260918", "SUMMARY:Odd params"]),
    );
    expect(cal.events[0].allDay).toBe(true);
  });

  it("reads a quoted parameter value", () => {
    const cal = parse(
      event(["UID:x", 'DTSTART;TZID="America/Chicago":20260917T090000']),
    );
    expect(iso(cal.events[0].start)).toBe("2026-09-17T09:00:00.000Z");
  });

  it("unescapes a newline inside a summary", () => {
    const cal = parse(
      event([
        "UID:x",
        // The two characters backslash-n, as an .ics file writes a line break.
        String.raw`SUMMARY:First line\nSecond line`,
        "DTSTART:20260917T140000Z",
      ]),
    );
    expect(cal.events[0].summary).toBe("First line\nSecond line");
  });

  it("unescapes an escaped backslash", () => {
    const cal = parse(
      event(["UID:x", String.raw`SUMMARY:Path C:\\temp`, "DTSTART:20260917T140000Z"]),
    );
    expect(cal.events[0].summary).toBe(String.raw`Path C:\temp`);
  });

  it("treats an impossible date as unreadable rather than as a real day", () => {
    expect(parse(event(["UID:x", "DTSTART:99999999"])).events).toEqual([]);
  });

  it("gives an event with an unreadable end a null end", () => {
    const cal = parse(event(["UID:x", "DTSTART:20260917T140000Z", "DTEND:garbage"]));
    expect(cal.events[0].end).toBeNull();
  });

  it("treats an RRULE with no FREQ as one it cannot expand", () => {
    const cal = parse(event(["UID:x", "DTSTART:20260917T140000Z", "RRULE:COUNT=5"]));
    expect(cal.unexpandedSeries).toBe(1);
    expect(cal.events).toHaveLength(1);
  });

  it("unfolds a line continued with a tab", () => {
    const text = wrap(
      [
        "BEGIN:VEVENT",
        "UID:x",
        "SUMMARY:Tab",
        "\tfolded",
        "DTSTART:20260917T140000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parse(text).events[0].summary).toBe("Tabfolded");
  });

  it("treats a whitespace-only summary as no summary", () => {
    const cal = parse(event(["UID:x", "SUMMARY:   ", "DTSTART:20260917T140000Z"]));
    expect(cal.events[0].summary).toBeNull();
  });

  it("leaves out a repeat that falls outside the window", () => {
    const cal = parse(
      event(["UID:d", "DTSTART:20260901T140000Z", "RRULE:FREQ=DAILY;COUNT=30"]),
      new Date("2026-09-10T00:00:00Z"),
      new Date("2026-09-12T23:59:59Z"),
    );
    expect(cal.events.map((e) => iso(e.start).slice(0, 10))).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });
});

describe("parseIcs — the last edges", () => {
  it("drops an unreadable rule whose start is outside the window, but still counts it", () => {
    const cal = parse(event(["UID:x", "DTSTART:20200101T140000Z", "RRULE:COUNT=5"]));
    expect(cal.events).toEqual([]);
    expect(cal.unexpandedSeries).toBe(1);
  });

  it("ignores an UNTIL it cannot read rather than ending the series at once", () => {
    const cal = parse(
      event([
        "UID:d",
        "DTSTART:20260901T140000Z",
        "RRULE:FREQ=DAILY;COUNT=2;UNTIL=garbage",
      ]),
    );
    expect(cal.events).toHaveLength(2);
  });
});
