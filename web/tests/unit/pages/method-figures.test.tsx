import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { validationCalendar, valueBars } from "@/domain/method.ts";
import { LabelDiagram } from "@/pages/method/LabelDiagram.tsx";
import { ValidationCalendar } from "@/pages/method/ValidationCalendar.tsx";
import { ValueBacktest } from "@/pages/method/ValueBacktest.tsx";

import { evaluationFixture } from "../fixtures/artifacts.ts";

const evaluation = evaluationFixture();

test("the label diagram draws the rule with the run's H and f", () => {
  render(<LabelDiagram horizonDays={90} eligibilityF={0.5} />);
  const figure = screen.getByRole("img", { name: /An illustrative customer/ });
  expect(figure).toHaveTextContent("cutoff");
  expect(figure).toHaveTextContent("H = 90 days");
  expect(figure).toHaveTextContent("f = 0.5");
});

test("without f the diagram still draws the label window and says what is missing", () => {
  render(<LabelDiagram horizonDays={90} eligibilityF={null} />);
  expect(screen.getByText(/The eligibility factor is not in this release/)).toBeInTheDocument();
});

test("the validation calendar has a title from the data and a table of stages", async () => {
  const cutoffs = [...new Set(evaluation.stability.map((r) => r.cutoff))];
  render(
    <ValidationCalendar
      rows={validationCalendar(evaluation.split, cutoffs, 90)}
      horizonDays={90}
    />,
  );
  const chart = screen.getByRole("region", {
    name: "Learn from 10 past months, calibrate on June, judge on September",
  });
  await userEvent.click(within(chart).getByRole("button", { name: "Show as table" }));
  expect(within(chart).getByRole("row", { name: /Sept 2011\s*test/ })).toBeInTheDocument();
});

test("the value backtest shows each bucket's ratio and the note", () => {
  render(<ValueBacktest bars={valueBars(evaluation.value_check)} />);
  const chart = screen.getByRole("region", { name: "The value estimate is conservative" });
  expect(chart).toHaveTextContent("1.33×");
  expect(chart).toHaveTextContent(
    "Only customers with 2 purchase days are overstated, by 33%; the list marks them.",
  );
});

test("a value backtest with no measured bucket says so instead of drawing an empty axis", () => {
  const bars = valueBars(evaluation.value_check).map((b) => ({ ...b, ratio: null }));
  render(<ValueBacktest bars={bars} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getAllByText("No bucket was measured.").length).toBeGreaterThan(0);
});
