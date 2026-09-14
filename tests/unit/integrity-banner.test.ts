import { describe, expect, it } from "vitest";

import {
  integrityBanner,
  isIntegrityKind,
  type IntegrityAlert,
} from "@/lib/notifications/integrity";

const at = (iso: string) => new Date(iso);

function alert(extra: Partial<IntegrityAlert>): IntegrityAlert {
  return {
    id: "a",
    kind: "spine_drift",
    severity: "critical",
    title: "Offer 2026-09: sources off by $10.00",
    createdAt: at("2026-09-14T10:00:00Z"),
    ...extra,
  };
}

describe("isIntegrityKind", () => {
  it("knows which notifications mean the money doesn't reconcile", () => {
    expect(isIntegrityKind("spine_drift")).toBe(true);
    expect(isIntegrityKind("sheet_drift")).toBe(true);
    expect(isIntegrityKind("payment_failed")).toBe(false);
    expect(isIntegrityKind("eod_missing")).toBe(false);
  });
});

describe("integrityBanner", () => {
  it("says nothing when there is nothing to review", () => {
    expect(integrityBanner([])).toBeNull();
    expect(integrityBanner([alert({ kind: "agreement_signed" })])).toBeNull();
  });

  it("puts critical first, newest first within a severity, and caps the lines", () => {
    const model = integrityBanner([
      alert({
        id: "w1",
        kind: "sheet_drift",
        severity: "warning",
        title: "W old",
        createdAt: at("2026-09-10T00:00:00Z"),
      }),
      alert({ id: "c1", title: "C old", createdAt: at("2026-09-11T00:00:00Z") }),
      alert({ id: "c2", title: "C new", createdAt: at("2026-09-13T00:00:00Z") }),
      alert({
        id: "w2",
        kind: "sheet_drift",
        severity: "warning",
        title: "W new",
        createdAt: at("2026-09-12T00:00:00Z"),
      }),
      alert({ id: "x", kind: "bod_digest", title: "not money" }),
    ]);
    expect(model).toEqual({
      ids: ["c2", "c1", "w2", "w1"],
      count: 4,
      severity: "critical",
      headline: "4 money-integrity alerts not yet reviewed",
      lines: ["C new", "C old", "W new"],
    });
  });

  it("reads as a warning with singular wording when only warnings remain", () => {
    expect(
      integrityBanner([
        alert({
          kind: "sheet_drift",
          severity: "warning",
          title: "Sheet drift: 1 rows, $0.08",
        }),
      ]),
    ).toMatchObject({
      count: 1,
      severity: "warning",
      headline: "1 money-integrity alert not yet reviewed",
      lines: ["Sheet drift: 1 rows, $0.08"],
    });
  });

  it("orders an unknown severity after the known ones", () => {
    const model = integrityBanner([
      alert({ id: "odd", severity: "info", title: "odd" }),
      alert({ id: "warn", severity: "warning", title: "warn" }),
    ]);
    expect(model?.ids).toEqual(["warn", "odd"]);
    expect(model?.severity).toBe("warning");
  });

  it("orders two unknown severities by time alone", () => {
    const model = integrityBanner([
      alert({ id: "old", severity: "info", createdAt: at("2026-09-01T00:00:00Z") }),
      alert({ id: "new", severity: "notice", createdAt: at("2026-09-02T00:00:00Z") }),
    ]);
    expect(model?.ids).toEqual(["new", "old"]);
  });
});
