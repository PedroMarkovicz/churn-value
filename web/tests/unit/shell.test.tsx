import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ARTIFACTS_TAG } from "@/app/release.ts";
import { Layout } from "@/components/layout/Layout.tsx";
import { ArtifactError } from "@/contract/load.ts";
import { DataErrorPage, NotFoundPage, PageErrorPage } from "@/pages/errors/ErrorPages.tsx";
import { routeTree } from "@/routes.tsx";

import { renderPage } from "./render.tsx";

const Stub = () => <h1>Stub page</h1>;

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
  expect(footer).toHaveTextContent(
    `Contract 1.2.0, artifacts release ${ARTIFACTS_TAG}, built from commit 0123456.`,
  );
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

test("the footer and the data error page name the pinned release", async () => {
  await renderPage(Stub, { layout: Layout });
  expect(ARTIFACTS_TAG).toMatch(/^artifacts-\d{8}-[0-9a-f]{7}$/);
  expect(screen.getByRole("contentinfo")).toHaveTextContent(`artifacts release ${ARTIFACTS_TAG}`);
});

test("the 404 page offers all six pages", async () => {
  await renderPage(() => <NotFoundPage />);
  const links = within(screen.getByRole("navigation", { name: "Pages" }))
    .getAllByRole("link")
    .map((link) => link.textContent);
  expect(links).toEqual(["Overview", "Simulator", "Sensitivity", "Customers", "Model", "Method"]);
});

test("a render error names the page, keeps the navigation and offers a way back", async () => {
  await renderPage(
    () => <PageErrorPage page="Sensitivity" error={new Error("chart exploded")} reset={() => {}} />,
    { layout: Layout },
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "The Sensitivity page could not be shown.",
  );
  expect(screen.getByText("chart exploded")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to the Overview" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
});

test("every page route has its own error boundary", () => {
  const children = (routeTree.children ?? []) as unknown as {
    options: { path?: string; errorComponent?: unknown };
  }[];
  expect(children).toHaveLength(6);
  for (const route of children)
    expect(route.options.errorComponent, route.options.path).toBeDefined();
});

test("Model and Method say their results are fixed instead of showing the scenario strip", async () => {
  await renderPage(Stub, { layout: Layout, url: "/model", path: "/model" });
  expect(screen.queryByRole("region", { name: "Scenario" })).not.toBeInTheDocument();
  await renderPage(Stub, { layout: Layout, url: "/simulator", path: "/simulator" });
  expect(screen.getByRole("region", { name: "Scenario" })).toBeInTheDocument();
});

test("on a phone the scenario editor opens as a bottom sheet", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
  try {
    await renderPage(Stub, { layout: Layout });
    await userEvent.click(screen.getByRole("button", { name: "Edit scenario" }));
    const sheet = await screen.findByRole("dialog", { name: "Scenario" });
    expect(within(sheet).getByRole("slider", { name: "Acceptance" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("Try again on a page error reloads the page's data, not just the boundary", async () => {
  let resets = 0;
  const router = await renderPage(
    () => (
      <PageErrorPage
        page="Model"
        error={new Error("experiments.json: HTTP 503")}
        reset={() => {
          resets += 1;
        }}
      />
    ),
    { layout: Layout },
  );
  const invalidate = vi.spyOn(router, "invalidate");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(invalidate).toHaveBeenCalled();
  expect(resets).toBe(1);
});
