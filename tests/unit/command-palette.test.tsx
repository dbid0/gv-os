import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/shell/command-palette";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.keyboard("{Control>}k{/Control}");

describe("CommandPalette", () => {
  it("lists client workspaces as destinations", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette roster={[{ slug: "client-north", name: "Client North" }]} />,
    );

    await open(user);
    expect(screen.getByText("Client North")).toBeInTheDocument();
  });

  it("picks up a roster that changed while it was mounted", async () => {
    const user = userEvent.setup();
    // The layout hands the palette a fresh array on every server render, so a
    // client added in Setup arrives as a prop change with no keystroke behind
    // it. At rest the query is empty, so nothing else would recompute — the
    // palette has to notice the roster itself.
    const { rerender } = render(
      <CommandPalette roster={[{ slug: "client-north", name: "Client North" }]} />,
    );

    await open(user);
    expect(screen.queryByText("Client South")).toBeNull();

    rerender(
      <CommandPalette
        roster={[
          { slug: "client-north", name: "Client North" },
          { slug: "client-south", name: "Client South" },
        ]}
      />,
    );

    expect(screen.getByText("Client South")).toBeInTheDocument();
  });

  it("drops a client that left the roster", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CommandPalette
        roster={[
          { slug: "client-north", name: "Client North" },
          { slug: "client-south", name: "Client South" },
        ]}
      />,
    );

    await open(user);
    expect(screen.getByText("Client South")).toBeInTheDocument();

    rerender(
      <CommandPalette roster={[{ slug: "client-north", name: "Client North" }]} />,
    );

    // An archived client must stop being a destination, not linger until the
    // next keystroke.
    expect(screen.queryByText("Client South")).toBeNull();
  });

  it("still filters by what was typed", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        roster={[
          { slug: "client-north", name: "Client North" },
          { slug: "harbor-sales", name: "Harbor Sales" },
        ]}
      />,
    );

    await open(user);
    await user.keyboard("harbor");

    expect(screen.getByText("Harbor Sales")).toBeInTheDocument();
    expect(screen.queryByText("Client North")).toBeNull();
  });
});
