import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SalesOverview } from "@/components/sales/sales-overview";
import type { Cents } from "@/lib/money";
import { SalesTabs } from "@/components/sales/sales-tabs";
import { SectionScaffold } from "@/components/sales/section-scaffold";
import { navigation } from "@/components/shell/nav-config";
import { Sidebar } from "@/components/shell/sidebar";
import type { ShellUser } from "@/lib/auth/user";
import { clearPersistedState } from "@/lib/client-state";

// A mutable pathname so each test can place itself somewhere in the app.
const nav = vi.hoisted(() => ({ pathname: "/sales" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: () => {},
    prefetch: () => {},
    refresh: () => {},
  }),
}));
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
    ["Teams", "Deals", "Commissions", "Leaderboard"].forEach((label) => {
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
    expect(screen.getByRole("tab", { name: /teams/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("does not treat Teams as active when on a sub-view", () => {
    // Teams is /sales exactly; being on /sales/deals must not light it up.
    nav.pathname = "/sales/deals";
    render(<SalesTabs />);
    expect(screen.getByRole("tab", { name: /teams/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: /deals/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

const OVERVIEW_STATS = {
  cashCents: 1_500_000 as Cents,
  revenueCents: 6_240_000 as Cents,
  deals: 19,
  closeRatePct: null,
};

describe("SalesOverview", () => {
  it("renders the real engine figures and no fabricated close rate", () => {
    const { container } = render(<SalesOverview stats={OVERVIEW_STATS} />);
    expect(container.textContent).toContain("$15,000");
    expect(container.textContent).toContain("$62,400");
    expect(container.textContent).toContain("19");
    expect(container.textContent).toContain("—");
  });

  it("collapses everything still waiting into one connect strip", () => {
    render(<SalesOverview stats={OVERVIEW_STATS} />);
    expect(screen.getByText(/Waiting to connect/i)).toBeInTheDocument();
    expect(screen.getByText(/Show rate/i)).toBeInTheDocument();
    expect(screen.getByText(/Commission owed/i)).toBeInTheDocument();
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
