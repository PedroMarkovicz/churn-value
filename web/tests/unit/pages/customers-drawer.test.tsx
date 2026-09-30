import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderCustomers, stubLayout } from "../customersPage.tsx";

stubLayout();

test("a link to a customer opens the drawer on them", async () => {
  await renderCustomers("/?customer=1");
  const drawer = await screen.findByRole("dialog", { name: "Customer 1" });
  expect(drawer).toHaveTextContent("Rank 1 of 6, United Kingdom");
  expect(drawer).toHaveTextContent(
    "Worth a call. A regular buyer, 10 days before their usual reorder, with £426 of margin at stake over 12 months and an offer that costs £43.",
  );
});

test("Esc closes the drawer and takes only the customer out of the link", async () => {
  const router = await renderCustomers("/?customer=2&g=0.4");
  await screen.findByRole("dialog", { name: "Customer 2" });
  await userEvent.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(router.state.location.search).toEqual({ g: "0.4" });
});

test("a row opens the drawer and Close shuts it", async () => {
  await renderCustomers();
  await userEvent.click(screen.getByRole("button", { name: "Open customer 3" }));
  const drawer = await screen.findByRole("dialog", { name: "Customer 3" });
  await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

test.each(["99999", "abc"])(
  "an id that is not in the holdout (%s) gets a notice, not a drawer",
  async (id) => {
    const router = await renderCustomers(`/?customer=${id}`);
    expect(
      screen.getByText(`Customer ${id} is not among the holdout customers of September 2011.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  },
);

test("the gauge and the money are written out with the customer's numbers", async () => {
  await renderCustomers("/?customer=1");
  const drawer = await screen.findByRole("dialog", { name: "Customer 1" });
  expect(drawer).toHaveTextContent("80.0% chance of leaving, above the 27.7% a call needs.");
  const money = within(drawer).getByRole("region", { name: "The money" });
  expect(money).toHaveTextContent("Margin at stake over 12 months£426");
  expect(money).toHaveTextContent("Offer, 10% of that£43");
  expect(money).toHaveTextContent("Cost to replace them£426");
  expect(money).toHaveTextContent("80.0% × 30% accept × (£426 − £43), minus 20.0% × £43, minus £1");
  expect(money).toHaveTextContent("Expected profit of a call£82.46");
});

test("a customer beyond the budget is told so", async () => {
  await renderCustomers("/?customer=3&bm=calls&bv=2");
  expect(await screen.findByRole("dialog", { name: "Customer 3" })).toHaveTextContent(
    "Worth a call, but outside the budget.",
  );
});

test("assumptions that leave break-even undefined read as words, never NaN", async () => {
  await renderCustomers("/?customer=1&g=0&lc=0&c=0");
  const drawer = await screen.findByRole("dialog", { name: "Customer 1" });
  expect(drawer).toHaveTextContent(
    "80.0% chance of leaving; under these assumptions no chance of leaving makes a call pay.",
  );
  expect(drawer.textContent).not.toMatch(/NaN|Infinity/);
});
