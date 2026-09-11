import { describe, expect, it } from "vitest";

import { scrubEmails } from "@/lib/observability/scrub-pii";

describe("scrubEmails", () => {
  it("redacts a user's email address", () => {
    const event = scrubEmails({ user: { email: "daniel@example.com" } });

    expect(event.user?.email).toBe("[redacted-email]");
  });

  it("redacts an email embedded in the event message", () => {
    const event = scrubEmails({
      message: "Failed to send invite to daniel@example.com: timeout",
    });

    expect(event.message).toBe("Failed to send invite to [redacted-email]: timeout");
  });

  it("leaves an event with no PII untouched", () => {
    const event = scrubEmails({ message: "Failed to connect to database" });

    expect(event.message).toBe("Failed to connect to database");
  });

  it("is a no-op when there is no user or message", () => {
    const event = scrubEmails({});

    expect(event).toEqual({});
  });
});
