import { describe, expect, it } from "vitest";

import { buildUtmUrl, normalizeUtmValue } from "@/lib/marketing/utm";

describe("normalizeUtmValue", () => {
  it("lowercases", () => {
    expect(normalizeUtmValue("YouTube")).toBe("youtube");
  });

  it("turns spaces into dashes", () => {
    expect(normalizeUtmValue("Day In Life")).toBe("day-in-life");
  });

  it("turns underscores into dashes", () => {
    expect(normalizeUtmValue("sharif_underscore")).toBe("sharif-underscore");
  });

  it("collapses runs of separators into one dash", () => {
    expect(normalizeUtmValue("a   b")).toBe("a-b");
    expect(normalizeUtmValue("a__--  b")).toBe("a-b");
  });

  it("strips punctuation and symbols, still collapsing to one dash", () => {
    expect(normalizeUtmValue("50% off!")).toBe("50-off");
    expect(normalizeUtmValue("Q&A Session")).toBe("q-a-session");
  });

  it("trims leading and trailing separators", () => {
    expect(normalizeUtmValue("  leading trailing  ")).toBe("leading-trailing");
    expect(normalizeUtmValue("--wrapped--")).toBe("wrapped");
  });

  it("leaves an already-normalized value untouched", () => {
    expect(normalizeUtmValue("2-date-corvette")).toBe("2-date-corvette");
  });

  it("is idempotent — normalizing twice equals normalizing once", () => {
    for (const raw of ["Day In Life!!", "  YT_Description  ", "sharif's-Corvette"]) {
      const once = normalizeUtmValue(raw);
      expect(normalizeUtmValue(once)).toBe(once);
    }
  });

  it("reduces a purely-punctuation string to empty", () => {
    expect(normalizeUtmValue("!!!")).toBe("");
    expect(normalizeUtmValue("")).toBe("");
  });
});

describe("buildUtmUrl", () => {
  const base = {
    destinationUrl: "https://gvfunnel.com/apply",
    source: "YouTube",
    medium: "Description",
    campaign: "Sharif",
    content: "2-Date-Corvette",
  };

  it("builds a fully lowercase, dash-normalized UTM link", () => {
    const result = buildUtmUrl(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual({
      source: "youtube",
      medium: "description",
      campaign: "sharif",
      content: "2-date-corvette",
    });
    const url = new URL(result.url);
    expect(url.searchParams.get("utm_source")).toBe("youtube");
    expect(url.searchParams.get("utm_medium")).toBe("description");
    expect(url.searchParams.get("utm_campaign")).toBe("sharif");
    expect(url.searchParams.get("utm_content")).toBe("2-date-corvette");
  });

  it("preserves existing, unrelated query params on the destination", () => {
    const result = buildUtmUrl({
      ...base,
      destinationUrl: "https://gvfunnel.com/apply?ref=abc123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.url);
    expect(url.searchParams.get("ref")).toBe("abc123");
    expect(url.searchParams.get("utm_source")).toBe("youtube");
  });

  it("handles a destination that already ends in a bare '?'", () => {
    const result = buildUtmUrl({
      ...base,
      destinationUrl: "https://gvfunnel.com/apply?",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.url).searchParams.get("utm_source")).toBe("youtube");
  });

  it("is idempotent — building from its own output yields the same URL", () => {
    const first = buildUtmUrl(base);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buildUtmUrl({ ...base, destinationUrl: first.url });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.url).toBe(first.url);
  });

  it("overwrites a stale utm_* on the destination rather than duplicating it", () => {
    const result = buildUtmUrl({
      ...base,
      destinationUrl: "https://gvfunnel.com/apply?utm_source=stale&utm_content=old",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.url);
    expect(url.searchParams.getAll("utm_source")).toEqual(["youtube"]);
    expect(url.searchParams.get("utm_content")).toBe("2-date-corvette");
  });

  it("rejects an empty destination", () => {
    const result = buildUtmUrl({ ...base, destinationUrl: "  " });
    expect(result).toEqual({ ok: false, reason: "empty_destination" });
  });

  it("rejects a destination with no scheme", () => {
    const result = buildUtmUrl({ ...base, destinationUrl: "gvfunnel.com/apply" });
    expect(result).toEqual({ ok: false, reason: "invalid_destination" });
  });

  it("rejects a non-http(s) scheme", () => {
    const result = buildUtmUrl({ ...base, destinationUrl: "javascript:alert(1)" });
    expect(result).toEqual({ ok: false, reason: "invalid_destination" });
  });

  it("rejects garbage that isn't a URL at all", () => {
    const result = buildUtmUrl({ ...base, destinationUrl: "not a url" });
    expect(result).toEqual({ ok: false, reason: "invalid_destination" });
  });

  it("fails closed when a field normalizes to empty", () => {
    const result = buildUtmUrl({ ...base, content: "!!!" });
    expect(result).toEqual({ ok: false, reason: "empty_param", field: "content" });
  });

  it("fails closed when a field is blank", () => {
    const result = buildUtmUrl({ ...base, source: "   " });
    expect(result).toEqual({ ok: false, reason: "empty_param", field: "source" });
  });

  it("accepts spaced/underscored/mixed-case field input and still normalizes it", () => {
    const result = buildUtmUrl({
      ...base,
      source: "  YOUTUBE  ",
      medium: "pinned_comment",
      campaign: "Client North",
      content: "beginners guide",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual({
      source: "youtube",
      medium: "pinned-comment",
      campaign: "client-north",
      content: "beginners-guide",
    });
  });
});
