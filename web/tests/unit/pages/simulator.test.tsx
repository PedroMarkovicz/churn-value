import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SimulatorPage } from "@/pages/simulator/SimulatorPage.tsx";
import { URL_DELAY_MS } from "@/scenario/ScenarioProvider.tsx";

import { renderPage } from "../render.tsx";

test("a slider applies at once and reaches the URL after a pause", async () => {
  const router = await renderPage(SimulatorPage);
  const before = screen.getByRole("heading", { level: 1 }).textContent;
  const thumb = screen.getByRole("slider", { name: "Acceptance" });
  act(() => {
    thumb.focus();
  });
  // The pause is measured on fake timers: on real ones, a busy test machine can take longer than
  // the pause to run the key presses, and "not yet" would fail for the wrong reason.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    // Synchronous key presses: Testing Library's async wrapper cannot advance Vitest's fake timers.
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.keyDown(thumb, { key: "PageDown" }); // Radix: PageDown = 10 steps
      });
    }
    expect(thumb).toHaveAttribute("aria-valuetext", "0%");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(before);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Under these assumptions no customer is worth a call.",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(URL_DELAY_MS - 1);
    });
    expect(router.state.location.search).toEqual({}); // not yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({ g: "0" });
    });
  } finally {
    vi.useRealTimers();
  }
});

test("the policy comparison names the share of perfect foresight", async () => {
  await renderPage(SimulatorPage);
  expect(
    screen.getByRole("heading", {
      name: /^The model keeps \d+% of what perfect foresight would earn$/,
    }),
  ).toBeInTheDocument();
  for (const label of ["Call everyone", "Random list, same size", "Rule A", "GBDT B"]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  const frame = screen.getByRole("region", { name: /perfect foresight/ });
  await userEvent.click(within(frame).getByRole("button", { name: "Show as table" }));
  // bootstrap intervals arrive after the debounce (here on the main thread: jsdom has no Worker)
  const intervals = await within(frame).findAllByText(/^−?£[\d,]+ to −?£[\d,]+$/);
  // every policy that is a list: call everyone, the two models and perfect foresight (random is
  // an expectation, with no interval)
  expect(intervals).toHaveLength(4);
});

test("typing a budget keeps what was typed and settles out-of-range values on leaving the field", async () => {
  await renderPage(SimulatorPage);
  await userEvent.click(screen.getByRole("radio", { name: "£ spend" }));
  const spend = screen.getByLabelText("Expected spend, £");
  await userEvent.clear(spend);
  await userEvent.type(spend, "2000");
  expect(spend).toHaveValue(2000);
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^(With a £2,000 budget|The budget does not cover)/,
    );
  });
  await userEvent.clear(spend);
  await userEvent.type(spend, "50");
  expect(spend).toHaveValue(50); // not snapped back while typing
  expect(screen.getByText("Between £100 and £100,000.")).toBeInTheDocument();
  await userEvent.tab();
  expect(spend).toHaveValue(100); // clamped when the field is left

  await userEvent.click(screen.getByRole("radio", { name: "Calls" }));
  const calls = screen.getByLabelText("Number of calls");
  await userEvent.clear(calls);
  await userEvent.type(calls, "2.5");
  await userEvent.tab();
  expect(calls).toHaveValue(3); // whole calls only
});
