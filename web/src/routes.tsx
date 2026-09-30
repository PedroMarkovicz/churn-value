import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { loadAppData } from "@/app/data.ts";
import { parseSearch, stringifySearch } from "@/app/search.ts";
import { Layout } from "@/components/layout/Layout.tsx";
import { DataErrorPage, LoadingPage, NotFoundPage } from "@/pages/errors/ErrorPages.tsx";
import { OverviewPage } from "@/pages/overview/OverviewPage.tsx";
import { SensitivityPage } from "@/pages/sensitivity/SensitivityPage.tsx";
import { SimulatorPage } from "@/pages/simulator/SimulatorPage.tsx";

const rootRoute = createRootRoute({
  // Search params stay raw; the scenario parser validates them and reports bad values.
  validateSearch: (search: Record<string, unknown>) => search,
  loader: loadAppData,
  staleTime: Infinity, // the artifacts never change while the page is open
  component: Layout,
  errorComponent: DataErrorPage,
  pendingComponent: LoadingPage,
  notFoundComponent: NotFoundPage,
});

// Literal paths (not a helper taking `path: string`) so links are type-checked against them.
const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
const simulatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/simulator",
  component: SimulatorPage,
});
const sensitivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sensitivity",
  component: SensitivityPage,
});

export const routeTree = rootRoute.addChildren([overviewRoute, simulatorRoute, sensitivityRoute]);

export function makeRouter() {
  return createRouter({
    routeTree,
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
    scrollRestoration: true,
    basepath: import.meta.env.BASE_URL,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
