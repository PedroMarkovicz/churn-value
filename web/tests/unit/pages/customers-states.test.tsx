import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderCustomers, stubLayout } from "../customersPage.tsx";

stubLayout();

test("a search that matches no customer at all says so and offers to clear it", async () => {
  await renderCustomers();
  await userEvent.type(screen.getByLabelText("Find a customer"), "999");
  expect(screen.getByText("No customer has an id that starts with “999”.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show all customers" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear the search" }));
  expect(screen.getByLabelText("Find a customer")).toHaveValue("");
  expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
});

test("an empty customer in the link is ignored, not reported as an unknown customer", async () => {
  await renderCustomers("/?customer=");
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
  expect(screen.queryByText(/is not among the holdout customers/)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the rank column's sort button is named in words", async () => {
  await renderCustomers();
  expect(screen.getByRole("button", { name: "Rank" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "#" })).not.toBeInTheDocument();
});
