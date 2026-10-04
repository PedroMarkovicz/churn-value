import { type DriftMatrix, driftTitle, type MetricRow, metricTitle } from "@/domain/model.ts";

const row = (label: string, value: number, low: number, high: number, position: number) =>
  ({ model: { label }, position, value, low, high }) as unknown as MetricRow;

test("models that are alike but are not the top ones are not called the top", () => {
  // C overlaps the best model's interval; B, ranked second, does not
  const rows = [
    row("A", 0.8, 0.78, 0.82, 1),
    row("B", 0.75, 0.74, 0.76, 2),
    row("C", 0.7, 0.6, 0.79, 3),
  ];
  expect(metricTitle(rows, "roc_auc")).toBe(
    "2 models are alike on ROC-AUC: their intervals overlap the best one's",
  );
});

test("the top models that are alike are still called the top", () => {
  const rows = [
    row("A", 0.8, 0.76, 0.84, 1),
    row("B", 0.78, 0.74, 0.82, 2),
    row("C", 0.6, 0.55, 0.65, 3),
  ];
  expect(metricTitle(rows, "roc_auc")).toBe(
    "The top 2 are alike on ROC-AUC: their intervals overlap",
  );
});

test("a single model is not called the best", () => {
  expect(metricTitle([row("A", 0.8, 0.78, 0.82, 1)], "roc_auc")).toBe(
    "A is the only model measured on ROC-AUC",
  );
});

const matrix = (psi: (number | null)[][]): DriftMatrix => ({
  features: ["tenure_days", "n_purchase_days"].slice(0, psi.length),
  cutoffs: ["2011-07-10"],
  psi,
});

test("a PSI of exactly 0.25 counts as a shift in the title, as it does in the colour", () => {
  expect(driftTitle(matrix([[0.25], [0.01]]))).toBe(
    "1 of 2 features hold; the largest shift is in days since first purchase",
  );
});

test("when nothing moved, the title does not name a largest shift", () => {
  expect(driftTitle(matrix([[0], [0]]))).toBe(
    "2 of 2 features hold; none has moved since training",
  );
});
