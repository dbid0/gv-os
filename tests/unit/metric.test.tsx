import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Metric, Money } from "@/components/ui/metric";
import { cents, fromDollars } from "@/lib/money";

describe("Money", () => {
  it("renders through formatUSD, so a raw float can never reach the screen", () => {
    render(<Money amount={fromDollars("1358.98")} />);
    expect(screen.getByText("$1,358.98")).toBeInTheDocument();
  });

  it("uses tabular numerals so figures line up in a column", () => {
    render(<Money amount={cents(500)} />);
    expect(screen.getByText("$5.00")).toHaveClass("numeric");
  });

  it("marks negative amounts distinctly", () => {
    render(<Money amount={cents(-4102)} />);
    const el = screen.getByText("-$41.02");
    expect(el.className).toMatch(/destructive/);
  });

  it("shows an explicit plus only when signed is requested", () => {
    const { rerender } = render(<Money amount={cents(2500)} />);
    expect(screen.getByText("$25.00")).toBeInTheDocument();

    rerender(<Money amount={cents(2500)} signed />);
    expect(screen.getByText("+$25.00")).toBeInTheDocument();
  });
});

describe("Metric", () => {
  it("shows what it is waiting on instead of a zero", () => {
    render(<Metric label="Cash collected" pending="Accounting" />);

    expect(screen.getByText(/waiting on: accounting/i)).toBeInTheDocument();
    // A zero would be a claim about reality. There must not be one.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("renders a real value once one exists", () => {
    render(
      <Metric
        label="Cash collected"
        value={<Money amount={fromDollars("25048.15")} />}
        hint="July"
      />,
    );

    expect(screen.getByText("$25,048.15")).toBeInTheDocument();
    expect(screen.getByText("July")).toBeInTheDocument();
    expect(screen.queryByText(/waiting on/i)).toBeNull();
  });
});
