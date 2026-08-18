import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileNav } from "@/components/shell/mobile-nav";
import { navigation } from "@/components/shell/nav-config";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

afterEach(() => {
  document.body.style.overflow = "";
});

describe("MobileNav", () => {
  it("is closed until opened", () => {
    render(<MobileNav />);
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("opens and lists every destination", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation/i }));

    const nav = screen.getByRole("navigation", { name: "Main" });
    navigation
      .flatMap((g) => g.items)
      .forEach((item) => {
        expect(within(nav).getByText(item.label)).toBeInTheDocument();
      });
  });

  it("locks the page behind it, and unlocks on close", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: /close navigation/i }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("marks the current route, and does not link the unbuilt ones", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: /accounting/i })).toBeNull();
  });

  it("reports its open state on the trigger", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    const trigger = screen.getByRole("button", { name: /open navigation/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
