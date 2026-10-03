import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import { loadAppData } from "@/app/data.ts";
import { parseSearch, stringifySearch } from "@/app/search.ts";
import { Layout } from "@/components/layout/Layout.tsx";
import { ArtifactError, loadArtifact, loadModelCard } from "@/contract/load.ts";
import { DataErrorPage, LoadingPage, NotFoundPage, pageError } from "@/pages/errors/ErrorPages.tsx";
import type { CardResult } from "@/pages/method/ModelCard.tsx";
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
  errorComponent: pageError("Overview"),
  path: "/",
  component: OverviewPage,
});
const simulatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  errorComponent: pageError("Simulator"),
  path: "/simulator",
  component: SimulatorPage,
});
const sensitivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  errorComponent: pageError("Sensitivity"),
  path: "/sensitivity",
  component: SensitivityPage,
});

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  errorComponent: pageError("Customers"),
  path: "/customers",
  loader: () => loadArtifact("timelines"), // spec §6.1: timelines only on this page
  staleTime: Infinity,
  pendingComponent: LoadingPage,
  // Code-split: the table, the drawer and the what-if stay out of the Overview's first load.
  component: lazyRouteComponent(
    () => import("@/pages/customers/CustomersRoute.tsx"),
    "CustomersRoute",
  ),
});

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  errorComponent: pageError("Model"),
  path: "/model",
  loader: () => loadArtifact("experiments"), // spec §6.1: experiments only on this page
  staleTime: Infinity,
  pendingComponent: LoadingPage,
  component: lazyRouteComponent(() => import("@/pages/model/ModelRoute.tsx"), "ModelRoute"),
});

const methodRoute = createRoute({
  getParentRoute: () => rootRoute,
  errorComponent: pageError("Method"),
  path: "/method",
  // A missing or altered card must not take the page down (spec §7): report it in its place.
  loader: (): Promise<CardResult> =>
    loadModelCard().then(
      (text) => ({ ok: true, text }),
      (error: unknown) => ({
        ok: false,
        reason:
          error instanceof ArtifactError ? `${error.artifact}: ${error.reason}` : String(error),
      }),
    ),
  staleTime: Infinity,
  pendingComponent: LoadingPage,
  component: lazyRouteComponent(() => import("@/pages/method/MethodRoute.tsx"), "MethodRoute"),
});

export const routeTree = rootRoute.addChildren([
  overviewRoute,
  simulatorRoute,
  sensitivityRoute,
  customersRoute,
  modelRoute,
  methodRoute,
]);

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
