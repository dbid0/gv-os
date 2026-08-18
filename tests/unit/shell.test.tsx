import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { navigation } from "@/components/shell/nav-config";
import { EmptyDashboard } from "@/components/shell/empty-dashboard";
import { Sidebar } from "@/components/shell/sidebar";
import type { ShellUser } from "@/lib/auth/user";
import { clearPersistedState } from "@/lib/client-state";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Sign out is a Server Action; the shell only needs it to exist as a callable.
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));

const USER: ShellUser = {
  email: "daniel@globalventures.app",
  name: "Daniel",
  initial: "D",
};

describe("nav config", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = navigation.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every item a description, since collapsed mode shows it as the tooltip", () => {
    navigation
      .flatMap((group) => group.items)
      .forEach((item) => {
        expect(item.description.length).toBeGreaterThan(0);
      });
  });
});

describe("Sidebar", () => {
  beforeEach(() => {
    // Not every environment provides localStorage (Node 26 + jsdom does not),
    // so the component falls back to memory. Clear BOTH, or state leaks between
    // tests on whichever environment is using the fallback.
    window.localStorage?.clear();
    clearPersistedState();
  });

  it("renders every navigation group and item", () => {
    render(<Sidebar user={USER} />);

    navigation.forEach((group) => {
      expect(screen.getByText(group.label)).toBeInTheDocument();
      group.items.forEach((item) => {
        expect(screen.getByText(item.label)).toBeInTheDocument();
      });
    });
  });

  it("links only the sections that exist, and marks the rest as unbuilt", () => {
    render(<Sidebar user={USER} />);

    // Dashboard is real, so it is a link.
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );

    // Planned sections must not be links to nowhere.
    expect(screen.queryByRole("link", { name: /accounting/i })).toBeNull();
    expect(screen.getAllByText("Soon").length).toBeGreaterThan(0);
  });

  it("marks the current route as the active page", () => {
    render(<Sidebar user={USER} />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("collapses and expands, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar user={USER} />);

    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");

    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(sidebar).toHaveAttribute("data-collapsed", "true");

    // Where localStorage exists it must actually be written to. Where it does
    // not, the memory fallback covers it and the behaviour below still holds.
    if (window.localStorage) {
      expect(window.localStorage.getItem("gvos.sidebar.collapsed")).toBe("true");
    }

    // The behaviour that matters either way: the preference survives a remount.
    unmount();
    render(<Sidebar user={USER} />);
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  });

  it("hides labels when collapsed", async () => {
    const user = userEvent.setup();
    render(<Sidebar user={USER} />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.queryByText("Dashboard")).toBeNull();
  });
});

describe("EmptyDashboard", () => {
  it("shows placeholders instead of invented numbers", () => {
    const { container } = render(<EmptyDashboard />);

    // Every tile is waiting on a module, and none of them state a figure.
    const waiting = screen.getAllByText(/waiting on:/i);
    expect(waiting.length).toBeGreaterThan(0);

    // No dollar amount should appear anywhere on an empty dashboard.
    expect(container.textContent).not.toMatch(/\$\d/);
  });

  it("names which module each tile depends on", () => {
    render(<EmptyDashboard />);

    // Scope to the one tile, since several wait on the same module.
    const tile = screen.getByText("Rev share owed").closest('[data-slot="metric"]');
    expect(tile).not.toBeNull();
    // Presence, not visibility: motion renders the entry variant at opacity 0
    // and jsdom never runs the animation to completion.
    expect(within(tile as HTMLElement).getByText(/accounting/i)).toBeInTheDocument();
  });
});
