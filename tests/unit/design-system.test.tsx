import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageHeader } from "@/components/shell/page-header";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusDot, StatusPill } from "@/components/ui/status";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("PageHeader", () => {
  it("renders the title and the highlighted phrase as one heading", () => {
    render(<PageHeader title="The foundation is" highlight="live." />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("The foundation is live.");
  });

  it("keeps the highlight in the brand gradient, not a flat colour", () => {
    render(<PageHeader title="Revenue" highlight="this month" />);
    expect(screen.getByText("this month")).toHaveClass("text-gradient-brand");
  });

  it("renders description, status, and actions when given", () => {
    render(
      <PageHeader
        title="Sales"
        description="Applications through closes"
        status={<StatusPill tone="live">Live</StatusPill>}
        actions={<button type="button">New deal</button>}
      />,
    );

    expect(screen.getByText("Applications through closes")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New deal" })).toBeInTheDocument();
  });

  it("omits the description entirely rather than rendering an empty node", () => {
    const { container } = render(<PageHeader title="Sales" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("StatusPill", () => {
  it("gives only the live tone the brand colour, so attention stays scarce", () => {
    const { rerender, container } = render(<StatusPill tone="live">Live</StatusPill>);
    expect(container.querySelector(".dot-brand")).not.toBeNull();

    rerender(<StatusPill tone="pending">Pending</StatusPill>);
    expect(container.querySelector(".dot-brand")).toBeNull();
  });

  it("marks the dot decorative so screen readers read only the label", () => {
    const { container } = render(<StatusDot tone="danger" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
  });
});

describe("Panel", () => {
  it("renders a header only when there is something to put in it", () => {
    const { container, rerender } = render(<Panel>body</Panel>);
    expect(container.querySelector("header")).toBeNull();

    rerender(<Panel title="Clients">body</Panel>);
    expect(container.querySelector("header")).not.toBeNull();
  });

  it("supports an aside beside the title", () => {
    render(
      <Panel title="Clients" aside={<StatusPill tone="live">3 active</StatusPill>}>
        body
      </Panel>,
    );

    const header = screen.getByText("Clients").closest("header");
    expect(within(header as HTMLElement).getByText("3 active")).toBeInTheDocument();
  });
});

describe("Rows", () => {
  it("separates rows with a single hairline gap, never doubled borders", () => {
    const { container } = render(
      <Rows>
        <Row>one</Row>
        <Row>two</Row>
      </Rows>,
    );

    // One background layer showing through 1px gaps beats per-row borders,
    // which double up where rows meet.
    expect(container.firstElementChild?.className).toMatch(/gap-px/);
    expect(container.firstElementChild?.className).toMatch(/bg-border/);
  });
});
