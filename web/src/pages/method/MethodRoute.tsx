/** The Method route, code-split: the card (or why it could not be read), handed to the page. */
import { useLoaderData } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { MethodPage } from "./MethodPage.tsx";

export function MethodRoute(): ReactElement {
  const card = useLoaderData({ from: "/method" });
  return <MethodPage card={card} />;
}
