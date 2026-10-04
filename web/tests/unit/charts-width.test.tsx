import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChartFrame, useWidth } from "@/charts/primitives.tsx";

import { stubWidth } from "./width.ts";

/** Like every chart of the site: the hook's owner stays mounted, the frame swaps its child. */
function Chart() {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  return (
    <ChartFrame title="A chart" subtitle="What is plotted" table={<p>the table</p>}>
      <div ref={ref} data-testid="plot">
        {width}
      </div>
    </ChartFrame>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a chart measures its new element after the table view", async () => {
  const stub = stubWidth(900);
  render(<Chart />);
  expect(screen.getByTestId("plot")).toHaveTextContent("900");

  await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
  await userEvent.click(screen.getByRole("button", { name: "Show as chart" }));

  const plot = screen.getByTestId("plot");
  expect(stub.observed.at(-1)).toBe(plot); // not the element the table view replaced
  act(() => {
    stub.fire(plot, 700); // the window was resized
  });
  expect(plot).toHaveTextContent("700");
});

test("a hidden chart keeps its last width", () => {
  const stub = stubWidth(900);
  render(<Chart />);
  const plot = screen.getByTestId("plot");
  act(() => {
    stub.fire(plot, 0); // detached or display: none
  });
  expect(plot).toHaveTextContent("900");
});

test("a chart narrower than the minimum is drawn at the minimum", () => {
  stubWidth(100);
  render(<Chart />);
  expect(screen.getByTestId("plot")).toHaveTextContent("240");
});
