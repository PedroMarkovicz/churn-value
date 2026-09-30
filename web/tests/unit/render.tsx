/** Render a page inside a memory router whose root loader returns fixture data. */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { AppData } from "@/app/data.ts";
import { parseSearch, stringifySearch } from "@/app/search.ts";
import type { EvaluationFile } from "@/contract/index.ts";
import { buildTable } from "@/domain/table.ts";
import { ScenarioProvider } from "@/scenario/ScenarioProvider.tsx";

import {
  customerFixture,
  customersFixture,
  featureSpecFixture,
  manifestFixture,
} from "./fixtures/artifacts.ts";

export function fixtureData(): AppData {
  const customers = customersFixture([
    customerFixture(1, 0.8, 1, 100),
    customerFixture(2, 0.7, 0, 100),
    customerFixture(3, 0.6, 1, 50),
    customerFixture(4, 0.05, 1, 100),
    customerFixture(5, 0.02, 0, 100),
    customerFixture(6, 0.1, 0, 10),
  ]);
  return {
    manifest: manifestFixture(),
    customers,
    evaluation: {} as EvaluationFile, // not read by the pages of this release
    featureSpec: featureSpecFixture(),
    table: buildTable(customers),
  };
}

export async function renderPage(
  page: () => ReactNode,
  {
    url = "/",
    data = fixtureData(),
    layout,
  }: { url?: string; data?: AppData; layout?: () => ReactNode } = {},
) {
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => search,
    loader: () => data,
    component:
      layout ??
      (() => (
        <ScenarioProvider>
          <Outlet />
        </ScenarioProvider>
      )),
  });
  const child = createRoute({ getParentRoute: () => root, path: "/", component: page });
  const router = createRouter({
    routeTree: root.addChildren([child]),
    history: createMemoryHistory({ initialEntries: [url] }),
    parseSearch,
    stringifySearch,
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1 });
  return router;
}
