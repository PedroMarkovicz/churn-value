/** The Method route, code-split: the card (or why it could not be read), handed to the page. */
import { useLoaderData, useRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { MethodPage } from "./MethodPage.tsx";

export function MethodRoute(): ReactElement {
  const card = useLoaderData({ from: "/method" });
  const router = useRouter();
  return (
    <MethodPage
      card={card}
      onRetry={() => {
        void router.invalidate(); // runs the route's loader again; a failed card is not cached
      }}
    />
  );
}
