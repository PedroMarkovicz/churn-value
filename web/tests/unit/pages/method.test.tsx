import { screen } from "@testing-library/react";

import { MethodPage } from "@/pages/method/MethodPage.tsx";

import { manifestFixture } from "../fixtures/artifacts.ts";
import { fixtureData, renderPage } from "../render.tsx";

const CARD = [
  "# Model card — churn-value",
  "",
  "## Model details",
  "",
  "| Model | ROC-AUC |",
  "|---|---|",
  "| GBDT B | 0.766 |",
  "",
  "<script>window.hacked = true</script>",
  "",
].join("\n");

test("the method page opens with its answer and every section", async () => {
  await renderPage(() => <MethodPage card={{ ok: true, text: CARD }} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Nobody tells a wholesaler they are leaving. The label has to be built.",
  );
  expect(screen.getByRole("img", { name: /An illustrative customer/ })).toBeInTheDocument();
  expect(
    screen.getByRole("region", {
      name: "Learn from 10 past months, calibrate on June, judge on September",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "The value estimate is conservative" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Assumptions" })).toHaveTextContent("λc");
  expect(screen.getByRole("heading", { name: "What this cannot tell you" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Design and decisions" })).toHaveAttribute(
    "href",
    "https://github.com/PedroMarkovicz/churn-value/blob/main/docs/design.md",
  );
});

test("the notebooks link goes to the pages published with the site", async () => {
  await renderPage(() => <MethodPage card={{ ok: true, text: CARD }} />);
  expect(screen.getByRole("link", { name: "The analysis notebooks" })).toHaveAttribute(
    "href",
    "/notebooks/",
  );
});

test("the model card renders from the release, with anchored headings and tables", async () => {
  await renderPage(() => <MethodPage card={{ ok: true, text: CARD }} />);
  const heading = await screen.findByRole(
    "heading",
    { name: "Model details" },
    { timeout: 15_000 },
  );
  expect(heading).toHaveAttribute("id", "model-details");
  expect(heading.tagName).toBe("H3"); // the card's headings sit under the page's
  expect(screen.getByRole("cell", { name: "0.766" })).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull(); // raw HTML in the card is never run
}, 20_000); // the first import of react-markdown and its plugins is slow to transform

test("a card that cannot be read leaves the rest of the page standing", async () => {
  await renderPage(() => (
    <MethodPage
      card={{
        ok: false,
        reason: "model_card.md: is not in this release (contract 1.2.0 ships it)",
      }}
    />
  ));
  expect(
    screen.getByText(
      "The model card could not be read: model_card.md: is not in this release (contract 1.2.0 ships it).",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "The value estimate is conservative" }),
  ).toBeInTheDocument();
});

test("a 1.1 release without pipeline settings still draws the label window", async () => {
  await renderPage(() => <MethodPage card={{ ok: true, text: CARD }} />, {
    data: { ...fixtureData(), manifest: manifestFixture({ pipeline: null }) },
  });
  expect(screen.getByText(/The eligibility factor is not in this release/)).toBeInTheDocument();
});
