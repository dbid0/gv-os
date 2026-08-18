import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DataTable, TableEmpty, type Column } from "@/components/ui/table";

type Row = { id: string; name: string; amount: number };

const rows: Row[] = [
  { id: "a", name: "Charlie", amount: 300 },
  { id: "b", name: "Alice", amount: 100 },
  { id: "c", name: "Bravo", amount: 200 },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Name", sortBy: (r) => r.name, render: (r) => r.name },
  {
    key: "amount",
    header: "Amount",
    numeric: true,
    sortBy: (r) => r.amount,
    render: (r) => String(r.amount),
  },
  { key: "note", header: "Note", render: () => "—" },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("DataTable", () => {
  it("renders every row in the given order until sorted", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(names()).toEqual(["Charlie", "Alice", "Bravo"]);
  });

  it("sorts ascending, then descending, then clears", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    const header = screen.getByRole("button", { name: /name/i });

    await user.click(header);
    expect(names()).toEqual(["Alice", "Bravo", "Charlie"]);

    await user.click(header);
    expect(names()).toEqual(["Charlie", "Bravo", "Alice"]);

    // A third click clears, rather than trapping you in a sort.
    await user.click(header);
    expect(names()).toEqual(["Charlie", "Alice", "Bravo"]);
  });

  it("reports sort state to assistive tech", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    await user.click(within(nameHeader).getByRole("button"));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("leaves unsortable columns without a sort control", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    const noteHeader = screen.getByRole("columnheader", { name: /note/i });
    expect(within(noteHeader).queryByRole("button")).toBeNull();
    expect(noteHeader).not.toHaveAttribute("aria-sort");
  });

  it("right-aligns numeric columns with tabular numerals", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    const firstRow = screen.getAllByRole("row")[1];
    const amountCell = within(firstRow).getAllByRole("cell")[1];
    expect(amountCell.className).toMatch(/numeric/);
    expect(amountCell.className).toMatch(/text-right/);
  });

  it("shows the empty state instead of an empty body", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        empty={<TableEmpty title="No deals yet" detail="They will appear here." />}
      />,
    );

    expect(screen.getByText("No deals yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
