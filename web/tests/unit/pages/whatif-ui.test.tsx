import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Customer } from "@/contract/index.ts";
import { runCampaign } from "@/domain/campaign.ts";
import { type CustomerRow, customerRows } from "@/domain/customerList.ts";
import { whatIfVerdict } from "@/domain/customerText.ts";
import { moneyPrecise } from "@/domain/format.ts";
import { baseValues, price } from "@/domain/whatif.ts";
import { WhatIf } from "@/pages/customers/WhatIf.tsx";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";
import type { Scorer } from "@/workers/inference.ts";

import { customerFixture, featureSpecFixture, fixtureFeatures } from "../fixtures/artifacts.ts";
import { fixtureData } from "../render.tsx";

const spec = featureSpecFixture();
const { table, customers } = fixtureData();
const rows = customerRows(table, runCampaign(table, DEFAULT_SCENARIO), DEFAULT_SCENARIO);
const first = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error("missing fixture");
  return value;
};
const row = first(rows.find((r) => r.id === 1));
const customer = first(customers.customers.find((c) => c.customer_id === 1));

function renderWhatIf(scorer: Scorer | null, who: Customer = customer, r: CustomerRow = row) {
  render(<WhatIf customer={who} row={r} spec={spec} scenario={DEFAULT_SCENARIO} scorer={scorer} />);
}
const result = () => screen.getByRole("status", { name: "What-if result" });
const recencyIndex = spec.order.indexOf("recency_days");

test("before any edit the what-if invites one", () => {
  renderWhatIf(vi.fn<Scorer>());
  expect(result()).toHaveTextContent("Change a value to see how the model's answer moves.");
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
});

test("an edit reruns the model and shows before and after", async () => {
  const scorer = vi.fn<Scorer>((x) => Promise.resolve((x[recencyIndex] ?? 0) / 120));
  renderWhatIf(scorer);
  const input = screen.getByLabelText("Days since last purchase");
  await userEvent.clear(input);
  await userEvent.type(input, "60");
  expect(screen.getByText("was 20")).toBeInTheDocument();
  await waitFor(() => {
    expect(result()).toHaveTextContent(/Chance of leaving\s*80\.0%.*50\.0%/);
  });
  const after = price(
    { ...baseValues(customer.features, spec), recency_days: 60 },
    0.5,
    spec,
    DEFAULT_SCENARIO,
  );
  expect(result()).toHaveTextContent(moneyPrecise(after.expProfit));
  expect(result()).toHaveTextContent(whatIfVerdict(row.expProfit, after.expProfit));
});

test("inconsistent values are named on their field, and nothing runs", async () => {
  const scorer = vi.fn<Scorer>(() => Promise.resolve(0.5));
  renderWhatIf(scorer);
  const field = screen.getByLabelText("Purchase days in the last 90 days");
  await userEvent.clear(field);
  await userEvent.type(field, "0");
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription("At least 1: the last purchase was within 90 days.");
  expect(result()).toHaveTextContent("Fix the highlighted values to rerun the model.");
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(scorer).not.toHaveBeenCalled();
});

test("text that is not a number is caught", async () => {
  renderWhatIf(vi.fn<Scorer>());
  const field = screen.getByLabelText("Total spend (£)");
  await userEvent.clear(field);
  await userEvent.type(field, "abc");
  expect(field).toHaveAccessibleDescription("Enter a number.");
});

test("an amount typed with a pound sign or a thousands comma is read", async () => {
  renderWhatIf(vi.fn<Scorer>(() => Promise.resolve(0.5)));
  const field = screen.getByLabelText("Total spend (£)");
  await userEvent.clear(field);
  await userEvent.type(field, "£1,250");
  expect(field).not.toHaveAccessibleDescription("Enter a number.");
});

test("the reorder preset fills one consistent edit, and Reset undoes it", async () => {
  const quiet = customerFixture(9, 0.4, 1, 100, 30, {
    features: { ...fixtureFeatures(100, 30), recency_days: 60, tenure_days: 180 },
  });
  renderWhatIf(
    vi.fn<Scorer>(() => Promise.resolve(0.3)),
    quiet,
    { ...row, id: 9 },
  );
  await userEvent.click(screen.getByRole("button", { name: "Suppose they reordered 30 days ago" }));
  expect(screen.getByLabelText("Days since last purchase")).toHaveValue("30");
  expect(screen.getByLabelText("Purchase days in total")).toHaveValue("6");
  expect(screen.getByText("was 60")).toBeInTheDocument();
  expect(result()).not.toHaveTextContent("Fix the highlighted values");
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByLabelText("Days since last purchase")).toHaveValue("60");
  expect(result()).toHaveTextContent("Change a value to see how the model's answer moves.");
});

test("the preset is off for a customer who bought in the last 30 days", () => {
  renderWhatIf(vi.fn<Scorer>());
  expect(screen.getByRole("button", { name: "Suppose they reordered 30 days ago" })).toBeDisabled();
  expect(screen.getByText("They already bought in the last 30 days.")).toBeInTheDocument();
});

test.each([
  ["fails", vi.fn<Scorer>(() => Promise.reject(new Error("no wasm")))],
  ["is missing", null],
])("when the model %s, the what-if says so", async (_, scorer) => {
  renderWhatIf(scorer);
  const input = screen.getByLabelText("Days since last purchase");
  await userEvent.clear(input);
  await userEvent.type(input, "60");
  await waitFor(() => {
    expect(result()).toHaveTextContent(
      "The model could not run in this browser, so the what-if is unavailable. The rest of this page still works.",
    );
  });
});

test("under a budget, the reading does not claim who is on the list", async () => {
  render(
    <WhatIf
      customer={customer}
      row={row}
      spec={spec}
      scenario={{ ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 2 }}
      scorer={() => Promise.resolve(0.5)}
    />,
  );
  const input = screen.getByLabelText("Days since last purchase");
  await userEvent.clear(input);
  await userEvent.type(input, "60");
  await waitFor(() => {
    expect(result()).toHaveTextContent("the budget decides whether the list reaches them.");
  });
  expect(result()).not.toHaveTextContent("the list would");
});

test("fields show readable numbers, and untouched fields reach the model exactly", async () => {
  const noisy = customerFixture(9, 0.4, 1, 100, 30, {
    features: {
      ...fixtureFeatures(100, 30),
      spend_prev_90d: 100.15000000000003,
      cadence_cv: 0.8944738308078793,
    },
  });
  const scorer = vi.fn<Scorer>(() => Promise.resolve(0.5));
  renderWhatIf(scorer, noisy, { ...row, id: 9 });
  expect(screen.getByLabelText("Spend in the 90 days before those (£)")).toHaveValue("100.15");
  expect(screen.getByLabelText("Unevenness of the gaps between purchases (0 = even)")).toHaveValue(
    "0.894",
  );
  expect(result()).toHaveTextContent("Change a value to see how the model's answer moves.");
  const input = screen.getByLabelText("Days since last purchase");
  await userEvent.clear(input);
  await userEvent.type(input, "60");
  await waitFor(() => {
    expect(scorer).toHaveBeenCalled();
  });
  const features = scorer.mock.lastCall?.[0];
  expect(features?.[spec.order.indexOf("cadence_cv")]).toBe(0.8944738308078793);
  expect(features?.[spec.order.indexOf("spend_prev_90d")]).toBe(100.15000000000003);
});
