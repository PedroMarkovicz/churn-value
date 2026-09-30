import { act, screen, waitFor, within } from "@testing-library/react";
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
  await userEvent.keyboard("{PageDown}{PageDown}{PageDown}"); // Radix: PageDown = 10 steps
  expect(thumb).toHaveAttribute("aria-valuetext", "0%");
  expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(before);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Under these assumptions no customer is worth a call.",
  );
  expect(router.state.location.search).toEqual({}); // not yet
  await waitFor(
    () => {
      expect(router.state.location.search).toEqual({ g: "0" });
    },
    { timeout: URL_DELAY_MS * 8 },
  );
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
