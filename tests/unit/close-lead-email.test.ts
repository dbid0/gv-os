import { describe, expect, it } from "vitest";

import {
  emailFromCloseLead,
  phoneFromCloseLead,
  phoneKey,
} from "@/lib/crm/close-normalize";

describe("emailFromCloseLead", () => {
  it("takes the first contact's first email, lowercased", () => {
    expect(
      emailFromCloseLead({
        contacts: [
          { emails: [{ email: "Lead@Example.COM", type: "office" }] },
          { emails: [{ email: "second@example.com" }] },
        ],
      }),
    ).toBe("lead@example.com");
  });

  it("skips a contact with no emails and keeps looking", () => {
    expect(
      emailFromCloseLead({
        contacts: [{ emails: [] }, { emails: [{ email: "found@example.com" }] }],
      }),
    ).toBe("found@example.com");
  });

  it("returns null for a lead with no usable email — never invents one", () => {
    expect(emailFromCloseLead({ contacts: [] })).toBeNull();
    expect(emailFromCloseLead({})).toBeNull();
    expect(
      emailFromCloseLead({ contacts: [{ emails: [{ email: "not-an-email" }] }] }),
    ).toBeNull();
  });

  it("tolerates malformed payload shapes without throwing", () => {
    expect(emailFromCloseLead({ contacts: "garbage" as unknown as [] })).toBeNull();
    expect(
      emailFromCloseLead({ contacts: [null, 42, { emails: "x" }] as unknown as [] }),
    ).toBeNull();
  });
});

describe("phoneKey", () => {
  it("keeps the last ten digits whatever the formatting", () => {
    expect(phoneKey("+1 (555) 010-2030")).toBe("5550102030");
    expect(phoneKey("15550102030")).toBe("5550102030");
    expect(phoneKey("555-010-2030")).toBe("5550102030");
  });

  it("refuses anything under ten digits — null, never a guess", () => {
    expect(phoneKey("010-2030")).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("phoneFromCloseLead", () => {
  it("walks contacts→phones the same way emails walk", () => {
    expect(
      phoneFromCloseLead({
        contacts: [{ phones: [{ phone: "+1 555 010 2030", type: "mobile" }] }],
      }),
    ).toBe("5550102030");
  });

  it("null when no contact carries a usable phone", () => {
    expect(
      phoneFromCloseLead({ contacts: [{ phones: [{ phone: "123" }] }] }),
    ).toBeNull();
    expect(phoneFromCloseLead({})).toBeNull();
  });
});
