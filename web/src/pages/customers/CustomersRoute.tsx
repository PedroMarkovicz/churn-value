/** The Customers route, code-split: the timelines its loader fetched, handed to the page. */
import { useLoaderData } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { CustomersPage } from "./CustomersPage.tsx";

export function CustomersRoute(): ReactElement {
  const timelines = useLoaderData({ from: "/customers" });
  return <CustomersPage timelines={timelines} />;
}
