import { screen } from "@testing-library/react";

import { SimulatorPage } from "@/pages/simulator/SimulatorPage.tsx";

import { renderPage } from "../render.tsx";
import { stubWidth } from "../width.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("on a 320 px screen the policy chart still reads left to right, with names above the bars", async () => {
  stubWidth(248); // a panel on a 320 px phone
  await renderPage(SimulatorPage);
  const chart = screen.getByRole("region", { name: /perfect foresight|each policy/ });
  const ticks = [...chart.querySelectorAll('svg text[font-size="10.5"]')];
  expect(ticks).toHaveLength(2); // the two ends of the axis
  const [low, high] = ticks.map((tick) => Number(tick.getAttribute("x")));
  expect(low).toBeLessThan(high as number); // losses to the left, profits to the right
  expect(low).toBeGreaterThanOrEqual(0);
  expect(high).toBeLessThanOrEqual(248);
  const name = [...chart.querySelectorAll("svg text")].find(
    (text) => text.textContent === "Call everyone",
  );
  expect(name?.getAttribute("text-anchor")).toBe("start"); // above its bar, not beside it
});
