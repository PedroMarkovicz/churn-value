import { waitFor } from "@testing-library/react";

import { pageTitle } from "@/app/title.ts";
import { Layout, PAGES } from "@/components/layout/Layout.tsx";

import { renderPage } from "./render.tsx";

test.each([
  ["/", "Overview · churn-value"],
  ["/simulator", "Simulator · churn-value"],
  ["/model/", "Model · churn-value"], // a trailing slash is the same page
  ["/Model", "Model · churn-value"], // the router matches addresses without regard to case
  ["/nope", "Page not found · churn-value"],
  ["", "Page not found · churn-value"],
])("the address %s is titled %s", (pathname, title) => {
  expect(pageTitle(pathname, PAGES)).toBe(title);
});

test("the browser tab names the page", async () => {
  await renderPage(() => <h1>Stub page</h1>, { layout: Layout });
  await waitFor(() => {
    expect(document.title).toBe("Overview · churn-value");
  });
});
