import { screen } from "@testing-library/react";

import { SensitivityPage } from "@/pages/sensitivity/SensitivityPage.tsx";

import { renderPage } from "../render.tsx";

test("the sensitivity page gives the break-even acceptance and the widest assumption", async () => {
  await renderPage(SensitivityPage);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    /^This list keeps paying as long as at least \d+\.\d% of churners accept the offer\.$/,
  );
  expect(
    screen.getByRole("heading", {
      name: /^Acceptance can fall \d+\.\d points before this list loses money$/,
    }),
  ).toBeInTheDocument();
  await screen.findByRole("heading", {
    name: /^\w[\w ]* (matters more than every other assumption combined|moves the result more than any other assumption)$/,
  });
});

test("an empty list says so instead of drawing a break-even", async () => {
  await renderPage(SensitivityPage, { url: "/?g=0" });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "No customer is worth a call under these assumptions.",
  );
});
