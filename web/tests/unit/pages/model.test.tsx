import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ModelInfo } from "@/contract/index.ts";
import { ModelPage } from "@/pages/model/ModelPage.tsx";

import { evaluationFixture, manifestFixture, MODELS } from "../fixtures/artifacts.ts";
import { fixtureData, renderPage } from "../render.tsx";

test("the model page answers first, and says which scenario its numbers are fixed at", async () => {
  await renderPage(ModelPage);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "The model promised 32% would leave and 31% did. That is why its profit held up.",
  );
  expect(screen.getByText(/^Fixed results at the default scenario:/)).toHaveTextContent(
    "Acceptance 30%",
  );
});

test("calibration over time names who stays calibrated, and reads as a table", async () => {
  await renderPage(ModelPage);
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
  await renderPage(ModelPage, {
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
  await renderPage(ModelPage, {
    data: {
      ...fixtureData(),
      evaluation,
      manifest: manifestFixture({ models: [...MODELS, ...extras] }),
    },
  });
  expect(screen.getByText(/In the table only: Extra 6\./)).toBeInTheDocument();
});

test("promise against reality annotates what each model promised beyond what it made", async () => {
  await renderPage(ModelPage);
  const chart = screen.getByRole("region", { name: "Only GBDT B made close to what it promised" });
  expect(chart).toHaveTextContent("promised £2,482 more than it made");
  expect(chart).toHaveTextContent("promised £70,000 more than it made");
});
