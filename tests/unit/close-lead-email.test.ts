import { describe, expect, it } from "vitest";

import { emailFromCloseLead } from "@/lib/crm/close-normalize";

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
