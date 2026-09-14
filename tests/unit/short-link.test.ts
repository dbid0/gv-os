import { describe, expect, it } from "vitest";

import {
  generateShortCode,
  isShortCode,
  SHORT_CODE_LENGTH,
  safeRedirectTarget,
  shortUrl,
} from "@/lib/marketing/short-link";

describe("generateShortCode", () => {
  it("draws 7 characters of a-z0-9 from the random source", () => {
    const bytes = Buffer.from([0, 25, 26, 35, 36, 71, 251, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(generateShortCode(() => bytes)).toBe("az09a99");
    const code = generateShortCode();
    expect(code).toHaveLength(SHORT_CODE_LENGTH);
    expect(isShortCode(code)).toBe(true);
  });

  it("skips bytes that would bias the alphabet, drawing more when needed", () => {
    let call = 0;
    const source = (n: number) => {
      call += 1;
      // First draw is all rejected bytes; the second supplies the code.
      return call === 1 ? Buffer.alloc(n, 252) : Buffer.alloc(n, 1);
    };
    expect(generateShortCode(source)).toBe("bbbbbbb");
    expect(call).toBe(2);
  });
});

describe("isShortCode / shortUrl / safeRedirectTarget", () => {
  it("accepts only the exact code shape", () => {
    expect(isShortCode("abc1234")).toBe(true);
    expect(isShortCode("ABC1234")).toBe(false);
    expect(isShortCode("abc123")).toBe(false);
    expect(isShortCode("abc12345")).toBe(false);
    expect(isShortCode("abc-234")).toBe(false);
  });

  it("builds the public URL without doubling slashes", () => {
    expect(shortUrl("https://os.example.com", "abc1234")).toBe(
      "https://os.example.com/l/abc1234",
    );
    expect(shortUrl("https://os.example.com///", "abc1234")).toBe(
      "https://os.example.com/l/abc1234",
    );
  });

  it("redirects only to http(s) URLs", () => {
    expect(safeRedirectTarget("https://funnel.example.com/apply?utm_source=x")).toBe(
      "https://funnel.example.com/apply?utm_source=x",
    );
    expect(safeRedirectTarget("http://funnel.example.com")).toBe(
      "http://funnel.example.com/",
    );
    expect(safeRedirectTarget("javascript:alert(1)")).toBeNull();
    expect(safeRedirectTarget("ftp://files.example.com")).toBeNull();
    expect(safeRedirectTarget("not a url")).toBeNull();
  });
});
