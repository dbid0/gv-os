import { describe, expect, it } from "vitest";

import {
  applyTodoReorder,
  DEFAULT_TODO_STATUS,
  isTodoStatus,
  normalizeTodoStatus,
  planTodoReorder,
  TODO_STATUSES,
  type TodoRow,
} from "@/lib/workspace/todos";

describe("todo status validation", () => {
  it("accepts exactly the three Notion options", () => {
    expect(TODO_STATUSES).toEqual(["Not started", "In progress", "Done"]);
    for (const s of TODO_STATUSES) expect(isTodoStatus(s)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTodoStatus("done")).toBe(false); // case matters
    expect(isTodoStatus("Blocked")).toBe(false);
    expect(isTodoStatus("")).toBe(false);
    expect(isTodoStatus(null)).toBe(false);
    expect(isTodoStatus(undefined)).toBe(false);
    expect(isTodoStatus(3)).toBe(false);
  });

  it("normalizes an unknown value to the default, keeps a valid one", () => {
    expect(DEFAULT_TODO_STATUS).toBe("Not started");
    expect(normalizeTodoStatus("garbage")).toBe("Not started");
    expect(normalizeTodoStatus(null)).toBe("Not started");
    expect(normalizeTodoStatus("In progress")).toBe("In progress");
    expect(normalizeTodoStatus("Done")).toBe("Done");
  });
});

function orderRows(...ids: string[]) {
  return ids.map((id, i) => ({ id, sortOrder: i }));
}

describe("planTodoReorder", () => {
  it("returns null for an unknown row", () => {
    expect(planTodoReorder(orderRows("a", "b"), "zzz", null)).toBeNull();
  });

  it("moves a row to the end when beforeId is null", () => {
    const plan = planTodoReorder(orderRows("a", "b", "c"), "a", null);
    expect(plan?.updates).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
  });

  it("slots a row immediately before the given sibling", () => {
    const plan = planTodoReorder(orderRows("a", "b", "c"), "c", "a");
    expect(plan?.updates.map((u) => u.id)).toEqual(["c", "a", "b"]);
    expect(plan?.updates.map((u) => u.sortOrder)).toEqual([0, 1, 2]);
  });

  it("moving a row before itself is a stable no-op ordering", () => {
    const plan = planTodoReorder(orderRows("a", "b", "c"), "b", "b");
    // beforeId === moveId is ignored, so b lands at the end of the rest.
    expect(plan?.updates.map((u) => u.id)).toEqual(["a", "c", "b"]);
  });

  it("re-indexes gappy / colliding sortOrders into a clean 0..n", () => {
    const rows = [
      { id: "a", sortOrder: 5 },
      { id: "b", sortOrder: 5 },
      { id: "c", sortOrder: 100 },
    ];
    const plan = planTodoReorder(rows, "c", "a");
    expect(plan?.updates).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("falls back to the end when beforeId is unknown", () => {
    const plan = planTodoReorder(orderRows("a", "b"), "a", "ghost");
    expect(plan?.updates.map((u) => u.id)).toEqual(["b", "a"]);
  });
});

function todo(id: string, sortOrder: number): TodoRow {
  return {
    id,
    clientId: null,
    task: id,
    status: "Not started",
    dueDate: null,
    sortOrder,
  };
}

describe("applyTodoReorder", () => {
  it("returns full rows in the planned order with rewritten sortOrder", () => {
    const rows = [todo("a", 0), todo("b", 1), todo("c", 2)];
    const plan = planTodoReorder(rows, "a", null)!;
    const next = applyTodoReorder(rows, plan);
    expect(next.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(next.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    // Non-order fields are preserved.
    expect(next.find((r) => r.id === "a")?.task).toBe("a");
  });

  it("matches the plan the server would apply (client optimism == server truth)", () => {
    const rows = [todo("a", 0), todo("b", 1), todo("c", 2), todo("d", 3)];
    const plan = planTodoReorder(rows, "d", "b")!;
    const next = applyTodoReorder(rows, plan);
    expect(next.map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
  });
});
