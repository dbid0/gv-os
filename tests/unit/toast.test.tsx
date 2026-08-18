import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force the reduced-motion path. jsdom cannot complete an animation, so with
// exit animations enabled a dismissed toast lingers in the DOM forever and the
// assertions would be testing a tween rather than behaviour. The component is
// built to skip AnimatePresence entirely under reduced motion, which is also
// the correct behaviour for a real user who asked for less movement.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

import { ToastProvider, useToast } from "@/components/ui/toast";

function Harness() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast({ tone: "success", title: "Saved" })}>ok</button>
      <button
        onClick={() => toast({ tone: "error", title: "Failed", detail: "Try again" })}
      >
        fail
      </button>
      <button onClick={() => toast({ tone: "info", title: "Note" })}>info</button>
    </div>
  );
}

const setup = () =>
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );

describe("toasts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a toast when one is raised", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("auto-dismisses a success", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("NEVER auto-dismisses an error", () => {
    setup();
    fireEvent.click(screen.getByText("fail"));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    // A failure the user never read is a failure they will repeat.
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("can be dismissed by hand", () => {
    setup();
    fireEvent.click(screen.getByText("fail"));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("caps the stack so toasts do not become wallpaper", () => {
    setup();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByText("fail"));
    }
    expect(screen.getAllByText("Failed")).toHaveLength(3);
  });

  it("announces politely rather than interrupting", () => {
    setup();
    fireEvent.click(screen.getByText("info"));
    expect(screen.getByLabelText("Notifications")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("refuses to be used outside a provider, rather than silently doing nothing", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
    quiet.mockRestore();
  });
});
