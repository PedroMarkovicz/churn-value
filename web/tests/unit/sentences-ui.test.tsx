import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Layout } from "@/components/layout/Layout.tsx";
import { ArtifactError } from "@/contract/load.ts";
import { DataErrorPage } from "@/pages/errors/ErrorPages.tsx";

import { renderPage } from "./render.tsx";

const Stub = () => <h1>Stub page</h1>;

test("a link with unusable values says so in words that fit a malformed value, and Reset clears it", async () => {
  await renderPage(Stub, { url: "/?g=2&m=abc", layout: Layout });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Some values in this link could not be used and were reset to their defaults: acceptance, gross margin.",
  );
  const reset = screen.getByRole("button", { name: "Reset" });
  expect(reset).toBeEnabled(); // the scenario is the default, but the link is not clean
  await userEvent.click(reset);
  await waitFor(() => {
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
});

function renderError(error: ArtifactError) {
  return renderPage(() => (
    <DataErrorPage error={error} reset={() => {}} info={{ componentStack: "" }} />
  ));
}

test("an error a retry can fix says so", async () => {
  await renderError(new ArtifactError("customers.json", "the network request failed", true));
  expect(screen.getByText(/a retry usually fixes it/)).toBeInTheDocument();
});

test("a mismatch between the site and the release does not promise that a retry helps", async () => {
  await renderError(
    new ArtifactError(
      "manifest.json",
      "contract 2.0.0 cannot be read by this app (built for 1.2.0)",
    ),
  );
  expect(screen.queryByText(/usually fixes it/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/The site and the artifacts release do not match; a retry will not fix it/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
