import { describe, expect, it } from "vitest";

import {
  CLOSE_TYPE_HEADERS,
  payloadField,
  SETTER_HEADERS,
} from "@/lib/tracking/payload-fields";

describe("payloadField", () => {
  it("finds a value under a header in any casing or spacing", () => {
    expect(payloadField({ "  SETTER  NAME ": "Sam Carter" }, SETTER_HEADERS)).toBe(
      "Sam Carter",
    );
    expect(payloadField({ "Close Type": "PIF" }, CLOSE_TYPE_HEADERS)).toBe("PIF");
  });

  it("prefers the earlier alias over a later one", () => {
    expect(
      payloadField({ Type: "Webinar", "Deal Type": "2 pay" }, CLOSE_TYPE_HEADERS),
    ).toBe("2 pay");
  });

  it("skips blank values and falls through to the next alias", () => {
    expect(
      payloadField({ "Setter Name": "   ", Setter: "Riley Stone" }, SETTER_HEADERS),
    ).toBe("Riley Stone");
  });

  it("keeps the first non-blank value when two headers normalize the same", () => {
    expect(payloadField({ setter: "", Setter: "A", SETTER: "B" }, SETTER_HEADERS)).toBe(
      "A",
    );
  });

  it("is null with no payload or no matching header", () => {
    expect(payloadField(null, SETTER_HEADERS)).toBeNull();
    expect(payloadField(undefined, SETTER_HEADERS)).toBeNull();
    expect(payloadField({ Notes: "called twice" }, SETTER_HEADERS)).toBeNull();
  });
});
