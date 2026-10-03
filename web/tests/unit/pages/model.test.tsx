import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ModelInfo } from "@/contract/index.ts";
import { ModelPage } from "@/pages/model/ModelPage.tsx";

import {
  evaluationFixture,
  experimentsFixture,
  manifestFixture,
  MODELS,
} from "../fixtures/artifacts.ts";
import { fixtureData, renderPage } from "../render.tsx";

const page = () => <ModelPage experiments={experimentsFixture()} />;

test("the model page answers first, and says which scenario its numbers are fixed at", async () => {
  await renderPage(page);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "The model promised 32% would leave and 31% did. That is why its profit held up.",
  );
  expect(screen.getByText(/^Fixed results at the default scenario:/)).toHaveTextContent(
    "Acceptance 30%",
  );
});

test("calibration over time names who stays calibrated, and reads as a table", async () => {
  await renderPage(page);
  const chart = screen.getByRole("region", { name: "Only GBDT B stays calibrated after June" });
  await userEvent.click(within(chart).getByRole("button", { name: "Show as table" }));
  const rows = within(chart)
    .getAllByRole("row")
    .map((row) => row.textContent);
  expect(rows[0]).toBe("ModelAprMayJunJulAugSept");
  expect(rows[2]).toBe("GBDT B+2.0+3.00.0−1.8−2.5+0.8");
});

test("a model without calibration history is named under the chart, not drawn", async () => {
  const extra: ModelInfo = {
    name: "new_model",
    label: "New model",
    family: "gbdt",
    deployable: false,
  };
  await renderPage(page, {
    data: { ...fixtureData(), manifest: manifestFixture({ models: [...MODELS, extra] }) },
  });
  expect(screen.getByText(/No calibration history for New model\./)).toBeInTheDocument();
});

test("a ninth model is listed in the table, never given a generated colour", async () => {
  const extras: ModelInfo[] = Array.from({ length: 7 }, (_, i) => ({
    name: `extra_${i}`,
    label: `Extra ${i}`,
    family: "gbdt",
    deployable: false,
  }));
  const evaluation = evaluationFixture();
  evaluation.stability.push(
    ...extras.flatMap((m) =>
      evaluation.stability
        .filter((r) => r.model === "gbdt_b")
        .map((r) => ({ ...r, model: m.name })),
    ),
  );
  await renderPage(page, {
    data: {
      ...fixtureData(),
      evaluation,
      manifest: manifestFixture({ models: [...MODELS, ...extras] }),
    },
  });
  expect(screen.getByText(/In the table only: Extra 6\./)).toBeInTheDocument();
});

test("promise against reality annotates what each model promised beyond what it made", async () => {
  await renderPage(page);
  const chart = screen.getByRole("region", { name: "Only GBDT B made close to what it promised" });
  expect(chart).toHaveTextContent("promised £2,482 more than it made");
  expect(chart).toHaveTextContent("promised £70,000 more than it made");
});

test("the ranking chart shows intervals, and the metric toggle re-titles it", async () => {
  await renderPage(page);
  expect(screen.getByRole("region", { name: "GBDT B is best on ROC-AUC" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Brier score" }));
  const chart = screen.getByRole("region", {
    name: "The top 2 are alike on the Brier score: their intervals overlap",
  });
  expect(chart).toHaveTextContent("Lower is better.");
  await userEvent.click(within(chart).getByRole("button", { name: "Show as table" }));
  expect(within(chart).getAllByRole("row")[2]?.textContent).toBe("GBDT B0.2000.190 to 0.210");
});

test("reliability starts on the served model and can switch", async () => {
  await renderPage(page);
  expect(
    screen.getByRole("region", {
      name: "GBDT B: predicted matches observed, 2.0 points apart on average",
    }),
  ).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Model"), "Rule A");
  expect(
    screen.getByRole("region", {
      name: "Rule A: predicted matches observed, 2.0 points apart on average",
    }),
  ).toBeInTheDocument();
});

test("the drift map puts the most shifted feature first and reads as a table", async () => {
  await renderPage(page);
  const chart = screen.getByRole("region", {
    name: "2 of 3 features hold; the largest shift is in days since first purchase",
  });
  await userEvent.click(within(chart).getByRole("button", { name: "Show as table" }));
  const rows = within(chart)
    .getAllByRole("row")
    .map((row) => row.textContent);
  expect(rows[0]).toBe("FeatureJun 2010Sept 2011");
  expect(rows[1]).toBe("Days since first purchase4.700.30");
});

test("the run strip names the run, and the experiment runs open in a dialog", async () => {
  await renderPage(page);
  const strip = screen.getByRole("region", { name: "Reproducible run" });
  expect(strip).toHaveTextContent("40 Optuna trials per model, seed 42, 5 rolling-origin folds");
  expect(strip).toHaveTextContent("Code0123456");
  expect(strip).toHaveTextContent("Contract1.2.0");
  await userEvent.click(within(strip).getByRole("button", { name: "Experiment runs" }));
  const dialog = await screen.findByRole("dialog", { name: "Experiment runs" });
  expect(dialog).toHaveTextContent("GBDT B");
  expect(dialog).toHaveTextContent("learning_rate 0.01357");
});

test("the run strip links to the model card on the Method page", async () => {
  await renderPage(page);
  expect(screen.getByRole("link", { name: "Model card" })).toHaveAttribute(
    "href",
    "/method#model-card",
  );
});

test("a model the evaluation does not cover is named in every chart that lacks it", async () => {
  const extra: ModelInfo = {
    name: "new_model",
    label: "New model",
    family: "gbdt",
    deployable: false,
  };
  await renderPage(page, {
    data: { ...fixtureData(), manifest: manifestFixture({ models: [...MODELS, extra] }) },
  });
  expect(
    screen.getByRole("region", { name: "Only GBDT B made close to what it promised" }),
  ).toHaveTextContent("No promise to compare for New model.");
  expect(screen.getByRole("region", { name: "GBDT B is best on ROC-AUC" })).toHaveTextContent(
    "No ROC-AUC for New model.",
  );
  expect(
    screen.getByRole("region", { name: /^GBDT B: predicted matches observed/ }),
  ).toHaveTextContent("No reliability data for New model.");
});

test("the ranking chart says which models are in its table only", async () => {
  const extras: ModelInfo[] = Array.from({ length: 7 }, (_, i) => ({
    name: `extra_${i}`,
    label: `Extra ${i}`,
    family: "gbdt",
    deployable: false,
  }));
  const evaluation = evaluationFixture();
  for (const m of extras) {
    const gbdt = evaluation.models.gbdt_b;
    if (gbdt) evaluation.models[m.name] = gbdt;
  }
  await renderPage(page, {
    data: {
      ...fixtureData(),
      evaluation,
      manifest: manifestFixture({ models: [...MODELS, ...extras] }),
    },
  });
  const chart = screen.getByRole("region", { name: /alike on ROC-AUC|best on ROC-AUC/ });
  expect(chart).toHaveTextContent("In the table only: Extra 6.");
});
