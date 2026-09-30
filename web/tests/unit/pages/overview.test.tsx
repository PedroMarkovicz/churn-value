import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OverviewPage } from "@/pages/overview/OverviewPage.tsx";

import { renderPage } from "../render.tsx";

test("the overview states the result and the account adds up", async () => {
  await renderPage(OverviewPage);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    /^Of 6 customers due to buy again, calling 3 earned £\d+\.$/,
  );
  const account = screen.getByRole("region", { name: "Campaign account" });
  expect(within(account).getByText("Churners the list missed")).toBeInTheDocument();
  expect(within(account).getByText("Calling all 6 instead")).toBeInTheDocument();
  expect(screen.getByText("called, would have churned (2)")).toBeInTheDocument();
});

test("pointing at an account line keeps only its customers lit", async () => {
  await renderPage(OverviewPage);
  const field = screen.getByRole("img", { name: /customers called/ });
  const opacities = () => [...field.querySelectorAll("rect")].map((r) => r.getAttribute("opacity"));
  const missed = screen.getByRole("button", { name: /Churners the list missed/ });
  expect(opacities().every((o) => o === "1")).toBe(true);
  fireEvent.mouseEnter(missed);
  expect(opacities().filter((o) => o === "1")).toHaveLength(1); // one missed churner
  fireEvent.mouseLeave(missed);
  expect(opacities().every((o) => o === "1")).toBe(true);
  fireEvent.focus(missed); // the keyboard reaches the same highlight
  expect(opacities().filter((o) => o === "1")).toHaveLength(1);
});

test("the field describes itself for screen readers", async () => {
  await renderPage(OverviewPage);
  expect(screen.getByRole("img", { name: /customers called/ })).toHaveAccessibleName(
    "3 of 6 customers called: 2 would have churned, 1 would have stayed; 1 churner missed.",
  );
});

test("the field can be read as a table", async () => {
  await renderPage(OverviewPage);
  await userEvent.click(screen.getByRole("button", { name: "Show the field as a table" }));
  const table = screen.getByRole("table", { name: "Customers by outcome" });
  const rows = within(table)
    .getAllByRole("row")
    .map((row) => row.textContent);
  expect(rows).toEqual([
    "OutcomeCustomersShare",
    "called, would have churned233%",
    "called, would have stayed117%",
    "churned, not called117%",
    "stayed, not called233%",
  ]);
});
