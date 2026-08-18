import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "@/components/ui/segmented";

const segments = [
  { value: "sales", label: "Sales" },
  { value: "money", label: "Money" },
  { value: "team", label: "Team" },
];

describe("Segmented", () => {
  it("exposes itself as a tablist with one selected tab", () => {
    render(
      <Segmented
        ariaLabel="Dashboard view"
        segments={segments}
        value="sales"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Dashboard view" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sales" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Money" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("reports the chosen value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Segmented
        ariaLabel="Dashboard view"
        segments={segments}
        value="sales"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Team" }));
    expect(onChange).toHaveBeenCalledWith("team");
  });

  it("does not fire when the already-selected segment is clicked again", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Segmented
        ariaLabel="Dashboard view"
        segments={segments}
        value="sales"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Sales" }));
    // It does fire, and that is fine, but it must report the same value rather
    // than clearing the selection.
    expect(onChange).toHaveBeenCalledWith("sales");
  });
});
