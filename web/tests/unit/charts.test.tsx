import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { modelColor, MODEL_SLOTS } from "@/charts/palette.ts";
import { ChartFrame, spreadPositions } from "@/charts/primitives.tsx";

test("every chart can be read as a table", async () => {
  render(
    <ChartFrame title="Takeaway" subtitle="What is plotted" table={<p>the table</p>}>
      <p>the chart</p>
    </ChartFrame>,
  );
  expect(screen.getByRole("region", { name: "Takeaway" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.getByText("the table")).toBeInTheDocument();
  expect(screen.queryByText("the chart")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show as chart" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("spreadPositions keeps order, keeps the gap and stays centred on the data", () => {
  const placed = spreadPositions({ a: 0.5, b: 0.51, c: 0.9 }, 0.05);
  expect(placed.a).toBeLessThan(placed.b as number);
  expect((placed.b as number) - (placed.a as number)).toBeCloseTo(0.05, 12);
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  expect(mean(Object.values(placed))).toBeCloseTo(mean([0.5, 0.51, 0.9]), 12);
});

test("models take palette slots by ladder position; a ninth gets none", () => {
  expect(MODEL_SLOTS).toHaveLength(8);
  expect(modelColor(4)).toBe("#e87ba4"); // the deployed model's colour in the notebooks
  expect(modelColor(8)).toBeNull();
});
