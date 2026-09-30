import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Layout } from "@/components/layout/Layout.tsx";
import { ArtifactError } from "@/contract/load.ts";
import { DataErrorPage } from "@/pages/errors/ErrorPages.tsx";

import { renderPage } from "./render.tsx";

const Stub = () => <h1>Stub page</h1>;

test("a link with out-of-range values says which were reset", async () => {
  await renderPage(Stub, { url: "/?g=2&m=abc", layout: Layout });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Some values in this link were out of range and were reset to their defaults: acceptance, gross margin.",
  );
  expect(screen.getByText("Acceptance 30%")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
});

test("a changed scenario shows in the strip and can be reset", async () => {
  await renderPage(Stub, { url: "/?g=0.45&bm=calls&bv=2", layout: Layout });
  expect(screen.getByText("Acceptance 45%")).toBeInTheDocument();
  expect(screen.getByText("At most 2 calls")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByText("Acceptance 30%")).toBeInTheDocument();
});

test("the footer cites the data and names the build", async () => {
  await renderPage(Stub, { layout: Layout });
  const footer = screen.getByRole("contentinfo");
  expect(footer).toHaveTextContent("Online Retail II, Chen, D. (2012)");
  expect(footer).toHaveTextContent("Contract 1.2.0, built from commit 0123456.");
  expect(footer).toHaveTextContent("Scored by GBDT B");
});

test("a data error names the file and the reason", async () => {
  await renderPage(() => (
    <DataErrorPage
      error={new ArtifactError("customers.json", "/customers/0/p must be number")}
      reset={() => {}}
      info={{ componentStack: "" }}
    />
  ));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "The data for this page could not be read.",
  );
  expect(screen.getByText("customers.json")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
