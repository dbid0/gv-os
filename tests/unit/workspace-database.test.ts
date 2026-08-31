import { describe, expect, it } from "vitest";

import {
  applyRowReorder,
  buildDefaultColumns,
  coerceValueOnRetype,
  type DatabaseColumn,
  type DatabaseRow,
  DATABASE_COLUMN_TYPES,
  isDatabaseColumnType,
  isKnownOption,
  planRowReorder,
  reorderColumns,
  retypeColumnValues,
  sanitizeCellValue,
  SELECT_COLOR_NAMES,
  selectColorStyle,
} from "@/lib/workspace/database";

describe("column types", () => {
  it("has exactly the five supported types", () => {
    expect(DATABASE_COLUMN_TYPES).toEqual([
      "text",
      "select",
      "date",
      "checkbox",
      "url",
    ]);
  });

  it("guards known vs unknown types", () => {
    for (const t of DATABASE_COLUMN_TYPES) expect(isDatabaseColumnType(t)).toBe(true);
    expect(isDatabaseColumnType("relation")).toBe(false);
    expect(isDatabaseColumnType("")).toBe(false);
    expect(isDatabaseColumnType(null)).toBe(false);
    expect(isDatabaseColumnType(7)).toBe(false);
  });
});

describe("buildDefaultColumns", () => {
  it("seeds a Name text column and a Status select with three colored options", () => {
    let n = 0;
    const cols = buildDefaultColumns(() => `id${n++}`);
    expect(cols).toHaveLength(2);

    expect(cols[0]).toEqual({ id: "id0", name: "Name", type: "text" });

    expect(cols[1].name).toBe("Status");
    expect(cols[1].type).toBe("select");
    expect(cols[1].options).toEqual([
      { id: "id2", name: "Not started", color: "gray" },
      { id: "id3", name: "In progress", color: "blue" },
      { id: "id4", name: "Done", color: "green" },
    ]);

    // Every id the generator minted is unique.
    const ids = [cols[0].id, cols[1].id, ...cols[1].options!.map((o) => o.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectColorStyle", () => {
  it("returns a chip + dot for a known colour, and falls back to grey", () => {
    for (const name of SELECT_COLOR_NAMES) {
      const s = selectColorStyle(name);
      expect(typeof s.chip).toBe("string");
      expect(typeof s.dot).toBe("string");
    }
    expect(selectColorStyle("chartreuse")).toEqual(selectColorStyle("gray"));
  });
});

const selectCol: DatabaseColumn = {
  id: "c",
  name: "Status",
  type: "select",
  options: [
    { id: "o1", name: "Alpha", color: "gray" },
    { id: "o2", name: "Beta", color: "blue" },
  ],
};

describe("isKnownOption", () => {
  it("recognises only real option ids", () => {
    expect(isKnownOption(selectCol, "o1")).toBe(true);
    expect(isKnownOption(selectCol, "o9")).toBe(false);
    expect(isKnownOption(selectCol, null)).toBe(false);
    expect(isKnownOption({ id: "x", name: "n", type: "text" }, "o1")).toBe(false);
  });
});

describe("sanitizeCellValue", () => {
  const textCol: DatabaseColumn = { id: "t", name: "T", type: "text" };
  const urlCol: DatabaseColumn = { id: "u", name: "U", type: "url" };
  const dateCol: DatabaseColumn = { id: "d", name: "D", type: "date" };
  const checkCol: DatabaseColumn = { id: "b", name: "B", type: "checkbox" };

  it("text / url keep strings, blank a null/undefined, reject non-strings", () => {
    expect(sanitizeCellValue(textCol, "hi")).toBe("hi");
    expect(sanitizeCellValue(textCol, null)).toBe("");
    expect(sanitizeCellValue(urlCol, "example.com")).toBe("example.com");
    expect(() => sanitizeCellValue(textCol, 5)).toThrow();
  });

  it("checkbox coerces to a real boolean (only true is true)", () => {
    expect(sanitizeCellValue(checkCol, true)).toBe(true);
    expect(sanitizeCellValue(checkCol, false)).toBe(false);
    expect(sanitizeCellValue(checkCol, "yes")).toBe(false);
    expect(sanitizeCellValue(checkCol, null)).toBe(false);
  });

  it("date keeps yyyy-mm-dd, clears empty, rejects garbage", () => {
    expect(sanitizeCellValue(dateCol, "2026-08-30")).toBe("2026-08-30");
    expect(sanitizeCellValue(dateCol, "")).toBeNull();
    expect(sanitizeCellValue(dateCol, null)).toBeNull();
    expect(() => sanitizeCellValue(dateCol, "Aug 30")).toThrow();
  });

  it("select keeps only a known option id, clears empty, rejects unknown", () => {
    expect(sanitizeCellValue(selectCol, "o2")).toBe("o2");
    expect(sanitizeCellValue(selectCol, "")).toBeNull();
    expect(sanitizeCellValue(selectCol, null)).toBeNull();
    expect(() => sanitizeCellValue(selectCol, "o9")).toThrow();
  });
});

describe("coerceValueOnRetype", () => {
  const textCol: DatabaseColumn = { id: "t", name: "T", type: "text" };
  const urlCol: DatabaseColumn = { id: "u", name: "U", type: "url" };
  const checkCol: DatabaseColumn = { id: "b", name: "B", type: "checkbox" };

  it("→ text/url keeps a string, maps a select to its LABEL, else empty", () => {
    expect(coerceValueOnRetype("hi", textCol, "url")).toBe("hi");
    expect(coerceValueOnRetype("hi", urlCol, "text")).toBe("hi");
    expect(coerceValueOnRetype("o1", selectCol, "text")).toBe("Alpha");
    expect(coerceValueOnRetype(true, checkCol, "text")).toBe("");
    expect(coerceValueOnRetype(undefined, textCol, "text")).toBe("");
  });

  it("→ select keeps a value only when it is a valid id in the NEW options", () => {
    const opts = [{ id: "o1", name: "Alpha", color: "gray" as const }];
    expect(coerceValueOnRetype("o1", textCol, "select", opts)).toBe("o1");
    expect(coerceValueOnRetype("o2", selectCol, "select", opts)).toBeNull();
    // Retyping to select with no options yet clears every cell.
    expect(coerceValueOnRetype("o1", textCol, "select")).toBeNull();
  });

  it("→ date keeps a well-formed date, else null", () => {
    expect(coerceValueOnRetype("2026-01-02", textCol, "date")).toBe("2026-01-02");
    expect(coerceValueOnRetype("nope", textCol, "date")).toBeNull();
    expect(coerceValueOnRetype(true, checkCol, "date")).toBeNull();
  });

  it("→ checkbox is true only when the old value was exactly true", () => {
    expect(coerceValueOnRetype(true, checkCol, "checkbox")).toBe(true);
    expect(coerceValueOnRetype("x", textCol, "checkbox")).toBe(false);
    expect(coerceValueOnRetype(null, textCol, "checkbox")).toBe(false);
  });
});

describe("retypeColumnValues", () => {
  it("recomputes every row's value for the retyped column", () => {
    const rows: DatabaseRow[] = [
      { id: "r1", values: { c: "o1" }, sortOrder: 0 },
      { id: "r2", values: { c: "o2" }, sortOrder: 1 },
      { id: "r3", values: {}, sortOrder: 2 },
    ];
    // select → text: ids become their labels; a missing value becomes "".
    const out = retypeColumnValues(rows, selectCol, "text");
    expect(out).toEqual({ r1: "Alpha", r2: "Beta", r3: "" });
  });
});

describe("reorderColumns", () => {
  const cols: DatabaseColumn[] = [
    { id: "a", name: "A", type: "text" },
    { id: "b", name: "B", type: "text" },
    { id: "c", name: "C", type: "text" },
  ];

  it("orders by the given ids", () => {
    expect(reorderColumns(cols, ["c", "a", "b"]).map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("appends any id not mentioned, and ignores unknown ids", () => {
    expect(reorderColumns(cols, ["b"]).map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(reorderColumns(cols, ["c", "zzz", "a", "b"]).map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

function orderRows(...ids: string[]) {
  return ids.map((id, i) => ({ id, sortOrder: i }));
}

describe("planRowReorder", () => {
  it("returns null for an unknown row", () => {
    expect(planRowReorder(orderRows("a", "b"), "zzz", null)).toBeNull();
  });

  it("moves a row to the end when beforeId is null", () => {
    const plan = planRowReorder(orderRows("a", "b", "c"), "a", null);
    expect(plan?.updates).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
  });

  it("slots a row immediately before the given sibling", () => {
    const plan = planRowReorder(orderRows("a", "b", "c"), "c", "a");
    expect(plan?.updates.map((u) => u.id)).toEqual(["c", "a", "b"]);
    expect(plan?.updates.map((u) => u.sortOrder)).toEqual([0, 1, 2]);
  });

  it("re-indexes gappy / colliding sortOrders into a clean 0..n", () => {
    const rows = [
      { id: "a", sortOrder: 5 },
      { id: "b", sortOrder: 5 },
      { id: "c", sortOrder: 100 },
    ];
    const plan = planRowReorder(rows, "c", "a");
    expect(plan?.updates).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("falls back to the end when beforeId is unknown", () => {
    const plan = planRowReorder(orderRows("a", "b"), "a", "ghost");
    expect(plan?.updates.map((u) => u.id)).toEqual(["b", "a"]);
  });
});

function dbRow(id: string, sortOrder: number): DatabaseRow {
  return { id, values: { name: id }, sortOrder };
}

describe("applyRowReorder", () => {
  it("returns full rows in the planned order with rewritten sortOrder", () => {
    const rows = [dbRow("a", 0), dbRow("b", 1), dbRow("c", 2)];
    const plan = planRowReorder(rows, "a", null)!;
    const next = applyRowReorder(rows, plan);
    expect(next.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(next.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    // Non-order fields are preserved.
    expect(next.find((r) => r.id === "a")?.values).toEqual({ name: "a" });
  });

  it("matches the plan the server would apply (client optimism == server truth)", () => {
    const rows = [dbRow("a", 0), dbRow("b", 1), dbRow("c", 2), dbRow("d", 3)];
    const plan = planRowReorder(rows, "d", "b")!;
    const next = applyRowReorder(rows, plan);
    expect(next.map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
  });
});
