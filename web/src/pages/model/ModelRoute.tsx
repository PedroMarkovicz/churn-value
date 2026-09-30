/** The Model route, code-split: the experiment runs its loader fetched, handed to the page. */
import { useLoaderData } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { ModelPage } from "./ModelPage.tsx";

export function ModelRoute(): ReactElement {
  const experiments = useLoaderData({ from: "/model" });
  return <ModelPage experiments={experiments} />;
}
