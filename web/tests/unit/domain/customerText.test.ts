import type { CustomerRow } from "@/domain/customerList.ts";
import {
  buyerDescription,
  customerStory,
  dueSentence,
  gaugeSentence,
  horizonText,
  moneyFormula,
  monthName,
  reasonsTitle,
  share,
  shortHistoryHint,
  shortHistoryNote,
  verdict,
  whatIfVerdict,
} from "@/domain/customerText.ts";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";

function row(overrides: Partial<CustomerRow> = {}): CustomerRow {
  const value = 0.35 * 100 * (365 / 30);
  return {
    index: 0,
    id: 1,
    rank: 1,
    decision: "call",
    p: 0.8,
    value,
    incentive: 0.1 * value,
    replacement: value,
    benefit: value,
    expProfit: 82.46,
    breakEven: 0.2766,
    churned: true,
    isUk: true,
    nPurchaseDays: 5,
    recencyDays: 20,
    cadenceDays: 30,
    ...overrides,
  };
}

test.each([
  ["call", "Worth a call."],
  ["budget", "Worth a call, but outside the budget."],
  ["skip", "Not worth a call."],
] as const)("verdict(%s)", (decision, text) => {
  expect(verdict(decision)).toBe(text);
});

test.each([
  [365, "12 months"],
  [730, "24 months"],
  [90, "3 months"],
  [180, "6 months"],
])("horizonText(%s) = %s", (days, text) => {
  expect(horizonText(days)).toBe(text);
});

test("share keeps a decimal only when the value has one", () => {
  expect(share(0.3)).toBe("30%");
  expect(share(0.105)).toBe("10.5%");
});

test("the buyer is described by rhythm and lateness", () => {
  const late = row({ recencyDays: 122, cadenceDays: 88.4, nPurchaseDays: 6 });
  expect(buyerDescription(late, 0.89)).toBe(
    "A regular buyer who has gone quiet: 34 days past their usual reorder",
  );
  expect(buyerDescription(late, 1.2)).toBe(
    "An irregular buyer who has gone quiet: 34 days past their usual reorder",
  );
  expect(buyerDescription(row(), 0.3)).toBe("A regular buyer, 10 days before their usual reorder");
  expect(buyerDescription(row({ recencyDays: 30 }), 0.3)).toBe(
    "A regular buyer, due to reorder about now",
  );
  expect(buyerDescription(row({ nPurchaseDays: 2, recencyDays: 40, cadenceDays: 20 }), 0)).toBe(
    "A customer with only 2 purchase days who has gone quiet: 20 days past their usual reorder",
  );
});

test("the story adds the value at stake and the offer", () => {
  expect(customerStory(row({ value: 722, incentive: 72.2 }), 0.3, 365)).toBe(
    "A regular buyer, 10 days before their usual reorder, with £722 of margin at stake over 12 months and an offer that costs £72.",
  );
});

test("the gauge sentence handles every break-even, including undefined ones", () => {
  expect(gaugeSentence(0.351, 0.2)).toBe("35.1% chance of leaving, above the 20.0% a call needs.");
  expect(gaugeSentence(0.1, 0.2)).toBe("10.0% chance of leaving, below the 20.0% a call needs.");
  expect(gaugeSentence(0.2, 0.2)).toBe("20.0% chance of leaving, exactly the 20.0% a call needs.");
  const never =
    "30.0% chance of leaving; under these assumptions no chance of leaving makes a call pay.";
  expect(gaugeSentence(0.3, Number.POSITIVE_INFINITY)).toBe(never);
  expect(gaugeSentence(0.3, Number.NaN)).toBe(never);
  expect(gaugeSentence(0.3, 1.5)).toBe(never);
  expect(gaugeSentence(0.3, 0)).toBe(
    "30.0% chance of leaving; under these assumptions any chance of leaving makes a call pay.",
  );
});

test("the money formula is written out with the customer's numbers", () => {
  expect(moneyFormula(row(), DEFAULT_SCENARIO)).toBe(
    "80.0% × 30% accept × (£426 − £43), minus 20.0% × £43, minus £1",
  );
  expect(moneyFormula(row(), { ...DEFAULT_SCENARIO, contact_cost: 0.5 })).toMatch(/minus £0\.50$/);
});

test("the due sentence places the expected next purchase against the cutoff", () => {
  expect(dueSentence(122, 88.4)).toBe("Their next purchase was due 34 days before the cutoff.");
  expect(dueSentence(20, 30)).toBe("Their next purchase was due 10 days after the cutoff.");
  expect(dueSentence(30, 30)).toBe("Their next purchase was due at the cutoff.");
});

test("the reasons title names the strongest reason for risk", () => {
  const c = (feature: string, value: number, shap: number) => ({ feature, value, shap });
  expect(reasonsTitle([c("n_purchase_days", 6, -0.21), c("spend_90d", 0, 0.16)], 90)).toBe(
    "The strongest reason for risk: no spend in the last 90 days.",
  );
  expect(reasonsTitle([c("is_uk", 1, -0.05), c("n_purchase_days", 6, -0.21)], 90)).toBe(
    "Every reason here lowers the risk, most of all: 6 purchase days so far.",
  );
  expect(reasonsTitle([], 90)).toBe("The model's explanation lists no reasons for this customer.");
});

test("the what-if verdict compares the call before and after", () => {
  expect(whatIfVerdict(20.59, 1.2)).toBe(
    "Still just above break-even: the list would keep them, barely.",
  );
  expect(whatIfVerdict(20, 15)).toBe("Still worth a call, though less than before.");
  expect(whatIfVerdict(20, 25)).toBe("Still worth a call, and more than before.");
  expect(whatIfVerdict(20, -3)).toBe("No longer worth a call: the list would drop them.");
  expect(whatIfVerdict(-3, 20)).toBe("Now worth a call: the list would add them.");
  expect(whatIfVerdict(-3, -1)).toBe("Still not worth a call.");
});

test("monthName reads the cutoff's month in UTC", () => {
  expect(monthName("2011-09-10")).toBe("September");
  expect(monthName("2011-01-01")).toBe("January");
});

test("the short-history note appears only when they are most of the top", () => {
  const rows = Array.from({ length: 6 }, (_, i) => row({ id: i + 1, rank: i + 1 }));
  expect(shortHistoryNote(rows)).toBeNull();
  const short = rows.map((r, i) => (i < 4 ? { ...r, nPurchaseDays: 3 } : r));
  expect(shortHistoryNote(short)).toBe(
    "4 of the 6 best-ranked customers have three purchase days or fewer, so their value rests on a short history.",
  );
  expect(shortHistoryNote([])).toBeNull();
});

test("the short-history hint quotes the value backtest when it has one", () => {
  const base = "Only two purchase days, so their value is extrapolated from very little.";
  expect(shortHistoryHint(undefined)).toBe(base);
  const bucket = {
    bucket: "2",
    min_purchase_days: 2,
    max_purchase_days: 2,
    n: 117,
    predicted_revenue: 85962,
    actual_revenue: 64560,
    ratio: 1.3315,
  };
  expect(shortHistoryHint([bucket])).toBe(
    `${base} For customers like them who stayed, the value formula overstated their revenue by 33%.`,
  );
  expect(shortHistoryHint([{ ...bucket, ratio: 0.9 }])).toBe(base);
});

test("under a budget, the what-if speaks of worth, not of the list it cannot see", () => {
  const budget = "the budget decides whether the list reaches them.";
  expect(whatIfVerdict(20.59, 1.2, true)).toBe(`Still just above break-even; ${budget}`);
  expect(whatIfVerdict(20, 15, true)).toBe(`Still worth a call; ${budget}`);
  expect(whatIfVerdict(-3, 20, true)).toBe(`Now worth a call; ${budget}`);
  expect(whatIfVerdict(20, -3, true)).toBe("No longer worth a call.");
  expect(whatIfVerdict(-3, -1, true)).toBe("Still not worth a call.");
});
