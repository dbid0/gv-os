import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SalesOverview } from "@/components/sales/sales-overview";
import { SalesTabs } from "@/components/sales/sales-tabs";
import { SectionScaffold } from "@/components/sales/section-scaffold";
import { navigation } from "@/components/shell/nav-config";
import { Sidebar } from "@/components/shell/sidebar";
import type { ShellUser } from "@/lib/auth/user";
import { clearPersistedState } from "@/lib/client-state";

// A mutable pathname so each test can place itself somewhere in the app.
const nav = vi.hoisted(() => ({ pathname: "/sales" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));

const USER: ShellUser = {
  email: "daniel@globalventures.app",
  name: "Daniel",
  initial: "D",
};

describe("Sales in the nav", () => {
  it("is a real, linkable section now, not a planned one", () => {
    const sales = navigation
      .flatMap((group) => group.items)
      .find((item) => item.href === "/sales");
    expect(sales?.status).toBe("ready");
  });

  it("renders Sales as a link rather than a Soon stub", () => {
    nav.pathname = "/dashboard";
    clearPersistedState();
    render(<Sidebar user={USER} />);
    expect(screen.getByRole("link", { name: /sales/i })).toHaveAttribute(
      "href",
      "/sales",
    );
  });

  it("keeps the section active while on one of its sub-routes", () => {
    // The whole point of the sub-route active fix: standing on /sales/deals,
    // the Sales item is still the highlighted section.
    nav.pathname = "/sales/deals";
    clearPersistedState();
    render(<Sidebar user={USER} />);
    expect(screen.getByRole("link", { name: /sales/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("SalesTabs", () => {
  beforeEach(() => clearPersistedState());

  it("offers the four RepVision views", () => {
    nav.pathname = "/sales";
    render(<SalesTabs />);
    ["Overview", "Deals", "Commissions", "Leaderboard"].forEach((label) => {
      expect(
        screen.getByRole("tab", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    });
  });

  it("marks exactly the current view as selected", () => {
    nav.pathname = "/sales/commissions";
    render(<SalesTabs />);
    expect(screen.getByRole("tab", { name: /commissions/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /overview/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("does not treat Overview as active when on a sub-view", () => {
    // Overview is /sales exactly; being on /sales/deals must not light it up.
    nav.pathname = "/sales/deals";
    render(<SalesTabs />);
    expect(screen.getByRole("tab", { name: /overview/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: /deals/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("SalesOverview", () => {
  it("shows placeholders, never an invented dollar figure", () => {
    const { container } = render(<SalesOverview />);
    expect(screen.getAllByText(/waiting on:/i).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\$\d/);
  });

  it("names the pipeline that will fill the dashes", () => {
    render(<SalesOverview />);
    expect(screen.getByText(/Deal import/i)).toBeInTheDocument();
    expect(screen.getByText(/Commission engine/i)).toBeInTheDocument();
  });
});

describe("SectionScaffold", () => {
  it("previews the real columns and an honest empty state, no fake rows", () => {
    const { container } = render(
      <SectionScaffold
        title="Deals"
        waitingOn="the deal import"
        columns={["Date", "Customer", "Cash collected"]}
        emptyTitle="No deals yet"
        emptyDetail="Closed deals will appear here once the import is wired in."
      />,
    );
    expect(screen.getByText("No deals yet")).toBeInTheDocument();
    ["Date", "Customer", "Cash collected"].forEach((column) => {
      expect(screen.getByText(column)).toBeInTheDocument();
    });
    expect(container.textContent).not.toMatch(/\$\d/);
  });
});
