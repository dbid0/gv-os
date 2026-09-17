import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CallBoard } from "@/components/home/call-board";
import type { CallQueue, QueuedCall } from "@/lib/home/call-queue";

/**
 * The rep home can only render for a signed-in rep, and local dev has no
 * session, so this board is checked here rather than in a browser pass.
 */

const call = (over: Partial<QueuedCall> = {}): QueuedCall => ({
  id: "c1",
  name: "Marcus Webb",
  eventType: "Strategy call",
  // 14:30 UTC = 9:30am in the business zone (America/Chicago), which is what
  // the context falls back to with no provider around the component.
  startsAt: new Date("2026-09-17T14:30:00Z"),
  started: false,
  ...over,
});

const queue = (over: Partial<CallQueue> = {}): CallQueue => ({
  today: [call()],
  next: call(),
  upcoming: 0,
  undated: 0,
  ...over,
});

describe("CallBoard", () => {
  it("names the board after the offer, not after the rep", () => {
    // Bookings carry no rep, so "your calls" would claim an assignment that
    // does not exist in the data.
    render(<CallBoard queue={queue()} offerName="The Grid" />);
    expect(screen.getByText("The Grid calls")).toBeInTheDocument();
  });

  it("falls back to a bare title when the rep has no offer name", () => {
    render(<CallBoard queue={queue()} offerName={null} />);
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("shows each call's time and who it is with", () => {
    render(<CallBoard queue={queue()} offerName="The Grid" />);
    expect(screen.getByText("9:30 AM")).toBeInTheDocument();
    expect(screen.getByText("Marcus Webb")).toBeInTheDocument();
    expect(screen.getByText("Strategy call")).toBeInTheDocument();
  });

  it("says a call has no name rather than inventing one", () => {
    render(
      <CallBoard
        queue={queue({ today: [call({ name: null })], next: null })}
        offerName="The Grid"
      />,
    );
    expect(screen.getByText("No name")).toBeInTheDocument();
  });

  it("counts today's calls", () => {
    render(
      <CallBoard
        queue={queue({ today: [call(), call({ id: "c2" })] })}
        offerName="The Grid"
      />,
    );
    expect(screen.getByText("2 today")).toBeInTheDocument();
  });

  it("keeps a call that has already started on the board", () => {
    // A rep who ran long still needs to see the one they are on.
    render(
      <CallBoard
        queue={queue({ today: [call({ started: true })], next: null })}
        offerName="The Grid"
      />,
    );
    expect(screen.getByText("Marcus Webb")).toBeInTheDocument();
  });

  it("names tomorrow's first call when today is done", () => {
    const tomorrow = call({
      id: "tmw",
      name: "Nina Alvarez",
      startsAt: new Date("2026-09-18T15:00:00Z"),
    });
    render(
      <CallBoard
        queue={queue({ today: [call({ started: true })], next: tomorrow, upcoming: 1 })}
        offerName="The Grid"
      />,
    );
    expect(screen.getByText(/Next: Nina Alvarez/)).toBeInTheDocument();
    expect(screen.getByText("1 later")).toBeInTheDocument();
  });

  it("does not repeat the next call when it is already on today's list", () => {
    render(<CallBoard queue={queue()} offerName="The Grid" />);
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();
  });

  it("reads an empty day as empty, and still points at the next call", () => {
    const later = call({ id: "tmw", name: "Nina Alvarez" });
    render(
      <CallBoard queue={queue({ today: [], next: later })} offerName="The Grid" />,
    );
    expect(screen.getByText("Nothing booked today.")).toBeInTheDocument();
    expect(screen.getByText(/Next: Nina Alvarez/)).toBeInTheDocument();
    expect(screen.getByText("0 today")).toBeInTheDocument();
  });

  it("says nothing extra on an empty day with nothing ahead", () => {
    render(<CallBoard queue={queue({ today: [], next: null })} offerName="The Grid" />);
    expect(screen.getByText("Nothing booked today.")).toBeInTheDocument();
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();
  });

  it("reports bookings the scheduler gave no time for", () => {
    // Silently dropping them would hide a broken feed as an empty day.
    render(<CallBoard queue={queue({ undated: 2 })} offerName="The Grid" />);
    expect(
      screen.getByText("2 booked with no time from the scheduler"),
    ).toBeInTheDocument();
  });

  it("says nothing about undated bookings when there are none", () => {
    render(<CallBoard queue={queue()} offerName="The Grid" />);
    expect(screen.queryByText(/no time from the scheduler/)).not.toBeInTheDocument();
  });
});
