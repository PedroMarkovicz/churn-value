import { count, money, moneyCompact, moneyPrecise, percent, points } from "@/domain/format.ts";
import {
  customersHeadline,
  overviewHeadline,
  sensitivityHeadline,
  simulatorHeadline,
  tornadoTitle,
} from "@/domain/headlines.ts";
import type { TornadoBar } from "@/domain/stress.ts";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";

test.each([
  [23139.4, "£23,139"],
  [-128345, "−£128,345"],
  [-0.2, "£0"],
  [Number.NaN, "£0"],
  [Number.POSITIVE_INFINITY, "£0"],
])("money(%s) = %s", (value, text) => {
  expect(money(value)).toBe(text);
});

test.each([
  [40000, "£40k"],
  [-128345, "−£128k"],
  [23139, "£23.1k"],
  [1_250_000, "£1.3m"],
  [950, "£950"],
])("moneyCompact(%s) = %s", (value, text) => {
  expect(moneyCompact(value)).toBe(text);
});

test("the other formats", () => {
  expect(moneyPrecise(20.594)).toBe("£20.59");
  expect(moneyPrecise(-0.004)).toBe("£0.00");
  expect(percent(0.3)).toBe("30%");
  expect(percent(0.1723, 1)).toBe("17.2%");
  expect(percent(-0.0001, 1)).toBe("0.0%");
  expect(points(0.126)).toBe("+12.6");
  expect(points(-0.018)).toBe("−1.8");
  expect(points(0.00001)).toBe("0.0");
  expect(count(1920)).toBe("1,920");
});

test("headlines state the answer, and empty states say so plainly", () => {
  expect(overviewHeadline(1920, 993, 23139)).toBe(
    "Of 1,920 customers due to buy again, calling 993 earned £23,139.",
  );
  expect(overviewHeadline(1920, 50, -400)).toBe(
    "Of 1,920 customers due to buy again, calling 50 would have lost £400.",
  );
  expect(overviewHeadline(1920, 0, 0)).toBe("Under these assumptions no customer is worth a call.");
  expect(simulatorHeadline(DEFAULT_SCENARIO, 993, 25621, 23139)).toBe(
    "Call the 993 customers worth calling: £25,621 expected, £23,139 on the holdout.",
  );
  expect(
    simulatorHeadline(
      { ...DEFAULT_SCENARIO, budget_mode: "spend", budget_value: 5000 },
      400,
      9000,
      8000,
    ),
  ).toBe("With a £5,000 budget, call the best 400: £9,000 expected, £8,000 on the holdout.");
  expect(
    simulatorHeadline(
      { ...DEFAULT_SCENARIO, budget_mode: "spend", budget_value: 100 },
      0,
      0,
      0,
      12,
    ),
  ).toBe("The budget does not cover a single call worth making.");
  expect(sensitivityHeadline({ kind: "rate", gamma: 0.1723 })).toBe(
    "This list keeps paying as long as at least 17.2% of churners accept the offer.",
  );
  expect(sensitivityHeadline({ kind: "never" })).toBe(
    "This list loses money at any acceptance rate.",
  );
  expect(customersHeadline(993, 25621, 200)).toBe(
    "993 customers to call, worth £25,621 together. The first 200 bring half of it.",
  );
  expect(customersHeadline(1, 20, 1)).toBe("1 customer to call, worth £20 together.");
});

test("the tornado title only claims 'combined' when the widest bar outweighs the rest", () => {
  const bar = (parameter: TornadoBar["parameter"], span: number): TornadoBar => ({
    parameter,
    low: 0,
    high: span,
    atLow: 0,
    atHigh: 1,
  });
  const labels = { gamma: "Acceptance", margin: "Gross margin" };
  expect(tornadoTitle([bar("gamma", 10), bar("margin", 4)], labels)).toBe(
    "Acceptance matters more than every other assumption combined",
  );
  expect(tornadoTitle([bar("gamma", 10), bar("margin", 9), bar("lambda_c", 9)], labels)).toBe(
    "Acceptance moves the result more than any other assumption",
  );
});

test("an empty list blames the budget only when the budget is what empties it", () => {
  const budget = { ...DEFAULT_SCENARIO, budget_mode: "calls" as const, budget_value: 5 };
  // acceptance 0: nobody is worth a call, whatever the budget
  expect(simulatorHeadline(budget, 0, 0, 0, 0)).toBe(
    "Under these assumptions no customer is worth a call.",
  );
  // customers are worth a call, but the budget covers none of them
  expect(simulatorHeadline(budget, 0, 0, 0, 12)).toBe(
    "The budget does not cover a single call worth making.",
  );
  expect(sensitivityHeadline({ kind: "empty" }, true)).toBe(
    "The budget does not cover a single call worth making.",
  );
  expect(sensitivityHeadline({ kind: "empty" }, false)).toBe(
    "No customer is worth a call under these assumptions.",
  );
});
