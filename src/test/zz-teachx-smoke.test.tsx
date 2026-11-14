import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/client", () => ({ aiChat: async () => ({ ok: false, reason: "test" }), getAiStatus: async () => ({ active: "scripted" }) }));

import { ExamRunner } from "@/components/exams/ExamRunner";
import { getExam } from "@/lib/exams/catalog";
import { getState } from "@/lib/store";
import { OralExamSession } from "@/components/oral/OralExamSession";
import { CHECKRIDE_TRACKS } from "@/lib/checkride/content";
import { PreflightPrepStage, DocumentsStage, PlanningStage, WeatherStage, AircraftKnowledgeStage } from "@/components/checkride/stages-a";
import { WalkaroundStage } from "@/components/checkride/WalkAround";
import { NavigationStage, PostflightStage } from "@/components/checkride/stages-b";
import type { CheckrideAttempt } from "@/lib/store";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
Element.prototype.scrollTo = function () {} as typeof Element.prototype.scrollTo;

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ["/"] }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<RouterProvider router={router as any} />);
}

const track = CHECKRIDE_TRACKS[1]!; // instrument
const attempt: CheckrideAttempt = {
  id: "test-attempt-1",
  date: new Date().toISOString(),
  trackId: track.trackId,
  title: track.title,
  stages: track.stages.map((s) => ({ id: s.id, name: s.name, score: 0, status: "incomplete", notes: [], acsRef: s.acsRef })),
  overall: 0,
  passed: false,
  completed: false,
};

describe("exam runner", () => {
  it("runs a timed exam end-to-end and records once", async () => {
    const def = getExam("regs")!;
    renderWithRouter(<ExamRunner def={def} title="Regs test" mode="timed" count={5} backTo="/practice-tests" backLabel="Back" />);
    fireEvent.click(await screen.findByRole("button", { name: /Begin timed exam/i }));
    for (let i = 0; i < 5; i++) {
      await screen.findByText(new RegExp(`Question ${i + 1} of 5`));
      fireEvent.keyDown(window, { key: "a" });
      if (i === 1) fireEvent.keyDown(window, { key: "f" });
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
    await screen.findAllByText(/Review & submit/i);
    fireEvent.click(screen.getByRole("button", { name: /^Submit exam$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit and see results/i }));
    await screen.findByText(/Performance by subject/i);
    expect(getState().exams.length).toBe(1);
    expect(getState().exams[0]!.total).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: /Retake/i }));
    await screen.findByText(/Question 1 of 5/);
    expect(getState().exams.length).toBe(1);
  });

  it("study mode reveals explanation", async () => {
    const def = getExam("weather")!;
    renderWithRouter(<ExamRunner def={def} title="Wx" mode="study" count={3} backTo="/practice-tests" backLabel="Back" />);
    fireEvent.click(await screen.findByRole("button", { name: /Begin study session/i }));
    fireEvent.keyDown(window, { key: "2" });
    await screen.findByText(/Correct answer:/);
  });
});

describe("oral session", () => {
  it("asks, follows up and completes", async () => {
    const done = vi.fn();
    renderWithRouter(<OralExamSession level="beginner" trackId="private" count={2} onComplete={done} showReport={false} />);
    const box = await screen.findByLabelText("Your answer");
    await waitFor(() => expect(screen.getAllByText(/Examiner/).length).toBeGreaterThan(1), { timeout: 2000 });
    fireEvent.change(box, { target: { value: "I'm not sure, something about the engine and airplane" } });
    fireEvent.click(screen.getByRole("button", { name: /Send answer/i }));
    await waitFor(() => expect(screen.queryByText(/evaluating/i)).toBeNull(), { timeout: 3000 });
    // Answer whatever comes next (follow-up or next question) with "I don't know" until done.
    for (let i = 0; i < 4 && !done.mock.calls.length; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
      const btn = screen.getByRole("button", { name: /I don't know/i });
      if (!(btn as HTMLButtonElement).disabled) fireEvent.click(btn);
    }
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(done.mock.calls[0]![0].items.length).toBe(2);
  }, 20000);
});

describe("checkride stages render", () => {
  const props = (i: number) => ({ attempt, track, stage: track.stages[i]!, saved: attempt.stages[i]!, onComplete: vi.fn(), onSaveProgress: vi.fn() });
  it("renders stages without crashing", async () => {
    for (const [i, C] of [
      [0, PreflightPrepStage],
      [1, DocumentsStage],
      [2, AircraftKnowledgeStage],
      [3, WeatherStage],
      [4, PlanningStage],
      [6, WalkaroundStage],
      [8, NavigationStage],
      [11, PostflightStage],
    ] as const) {
      const p = props(i);
      const { unmount } = renderWithRouter(<C {...p} />);
      await screen.findAllByText(track.stages[i]!.name);
      unmount();
    }
  });
  it("planning stage grades exact answers as 100", async () => {
    const p = props(4);
    renderWithRouter(<PlanningStage {...p} />);
    const { planningScenario, solvePlan } = await import("@/lib/checkride/content");
    const sol = solvePlan(planningScenario("instrument"));
    const vals = [sol.trueHeading, sol.magHeading, sol.groundspeed, sol.eteMin, sol.fuelGal];
    const labels = ["True heading", "Magnetic heading", "Groundspeed", "Time en route", "Fuel required incl. reserve"];
    for (let k = 0; k < 5; k++) fireEvent.change(await screen.findByLabelText(labels[k]!), { target: { value: vals[k]!.toFixed(1) } });
    fireEvent.click(screen.getByRole("button", { name: /Submit for grading/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Record result/i }));
    expect(p.onComplete).toHaveBeenCalledWith(100, expect.any(Array));
  });
});
