import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProcessView from "../ProcessView";
import type { LucaMessage, ToolRound } from "../../lib/store";

const base = (over: Partial<LucaMessage> = {}): LucaMessage => ({
  uid: "m1", role: "assistant", content: "", ts: 0, ...over,
});

const round = (id: string, name: string): ToolRound => ({
  id, name, query: "", sources: [], status: "done",
});

describe("ProcessView", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:10Z")); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("renders nothing when finished with no trace and no tools", () => {
    const { container } = render(<ProcessView msg={base({ streaming: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("derives elapsed from msg.startedAt, so a REMOUNT does not reset it", () => {
    const startedAt = Date.now() - 7000; // began 7s ago
    const msg = base({ streaming: true, startedAt });
    const first = render(<ProcessView msg={msg} />);
    expect(screen.getByText("7s")).toBeTruthy();
    first.unmount();
    render(<ProcessView msg={msg} />); // remount (virtualisation / chat switch)
    expect(screen.getByText("7s")).toBeTruthy(); // old code showed 0s here
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("10s")).toBeTruthy();
  });

  it("is auto-open while thinking with no content, and the header button works", () => {
    render(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "step one" })} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);                                   // old code: no-op while live
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not force-collapse a panel the user opened once the answer starts", () => {
    const { rerender } = render(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "r" })} />);
    fireEvent.click(screen.getByRole("button"));            // user closes
    fireEvent.click(screen.getByRole("button"));            // user re-opens (explicit intent)
    rerender(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "r", content: "hello" })} />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses automatically when the answer starts if the user never touched it", () => {
    const { rerender } = render(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "r" })} />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    rerender(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "r", content: "hello" })} />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("does not double count: reasoning time shown once, tool duration dropped", () => {
    render(<ProcessView msg={base({
      streaming: false, reasoning: "x", thinkingMs: 4000,
      toolRounds: [{ id: "t", name: "web_search", query: "q", sources: [], status: "done", ms: 30000 }],
    })} />);
    const label = screen.getByRole("button").textContent || "";
    expect(label).toContain("Thought for 4s");
    expect(label).toContain("Searched 1 time");
    expect(label).not.toContain("30s");
  });

  it("groups finished rounds by type: 'Ran 2 commands, read 1 file'", () => {
    render(<ProcessView msg={base({
      streaming: false,
      toolRounds: [round("a", "run_code"), round("b", "run_code"), round("c", "fetch_page")],
    })} />);
    const label = screen.getByRole("button").textContent || "";
    expect(label).toContain("Ran 2 commands, read 1 file");
  });

  it("labels searches and unknown tools in the finished pill", () => {
    render(<ProcessView msg={base({
      streaming: false,
      toolRounds: [round("a", "web_search"), round("b", "mcp__srv__tool"), round("c", "mcp__srv__tool")],
    })} />);
    const label = screen.getByRole("button").textContent || "";
    expect(label).toContain("Searched 1 time, used 2 other tools");
  });

  it("finished pill is text-only: no leading icon, right chevron collapsed / down expanded", () => {
    render(<ProcessView msg={base({
      streaming: false, toolRounds: [round("a", "run_code")],
    })} />);
    const btn = screen.getByRole("button");
    expect(btn.closest(".pv--done")).toBeTruthy(); // minimal pill, not a card
    expect(document.querySelector(".pv-icon")).toBeNull();
    expect(document.querySelector(".pv-orb")).toBeNull();
    // lucide ChevronRight path when collapsed…
    expect(btn.querySelector("svg")?.innerHTML).toContain("m9 18 6-6-6-6");
    fireEvent.click(btn); // expand…
    expect(screen.getByRole("button").querySelector("svg")?.innerHTML).toContain("m6 9 6 6 6-6");
  });

  it("shows tool names, queries and marks a stuck 'running' round as done after the stream ends", () => {
    render(<ProcessView msg={base({
      streaming: false, reasoning: "x",
      toolRounds: [{ id: "t", name: "fetch_page", query: "example.com", sources: [], status: "running" }],
    })} />);
    expect(screen.getByText("Read page")).toBeTruthy();
    expect(document.querySelector(".pv-orb")).toBeNull(); // no spinner once finished
  });

  it("wires aria-controls to the collapsible region", () => {
    render(<ProcessView msg={base({ streaming: true, startedAt: Date.now(), reasoning: "r" })} />);
    const id = screen.getByRole("button").getAttribute("aria-controls")!;
    expect(document.getElementById(id)).toBeTruthy();
  });
});
