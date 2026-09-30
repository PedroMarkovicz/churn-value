import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EvaluationFile } from "@/contract/index.ts";
import { DEFAULT_SCENARIO, scenarioHash } from "@/scenario/schema.ts";

import { dataWith, renderCustomers, stubLayout } from "../customersPage.tsx";
import { customerFixture, fixtureFeatures } from "../fixtures/artifacts.ts";

stubLayout();

const listed = () =>
  screen.getAllByRole("button", { name: /^Open customer / }).map((b) => b.textContent);

test("the headline gives the list's worth and where half of it comes from", async () => {
  await renderCustomers();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    /^3 customers to call, worth £\d+ together\. The first 2 bring half of it\.$/,
  );
});

test("the list opens on the customers to call, best first", async () => {
  await renderCustomers();
  expect(listed()).toEqual(["1", "2", "3"]);
  expect(screen.getByRole("radio", { name: "Call (3)" })).toHaveAttribute("aria-checked", "true");
});

test("the decision filter shows the others", async () => {
  await renderCustomers();
  await userEvent.click(screen.getByRole("radio", { name: "Skip (3)" }));
  expect(listed()).toEqual(["6", "4", "5"]);
  await userEvent.click(screen.getByRole("radio", { name: "All" }));
  expect(listed()).toHaveLength(6);
});

test("search finds a customer by id, and says so when this view has none", async () => {
  await renderCustomers();
  await userEvent.type(screen.getByLabelText("Find a customer"), "6");
  expect(screen.getByText("No customer in this view matches “6”.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show all customers" }));
  expect(listed()).toEqual(["6"]);
});

test("the country filter keeps UK or other customers", async () => {
  await renderCustomers(
    "/",
    dataWith([
      customerFixture(1, 0.8, 1),
      customerFixture(2, 0.7, 0, 100, 30, { features: { ...fixtureFeatures(100, 30), is_uk: 0 } }),
    ]),
  );
  await userEvent.click(screen.getByRole("radio", { name: "Outside the UK" }));
  expect(listed()).toEqual(["2"]);
  await userEvent.click(screen.getByRole("radio", { name: "UK" }));
  expect(listed()).toEqual(["1"]);
});

test("outcomes stay hidden until asked for", async () => {
  await renderCustomers();
  expect(screen.queryByRole("columnheader", { name: "What happened" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show what happened" }));
  expect(screen.getByRole("button", { name: "Show what happened" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const first = screen.getAllByRole("row")[1];
  if (!first) throw new Error("no first row");
  expect(within(first).getByText("Churned")).toBeInTheDocument();
});

test("a column sorts when clicked and flips on the second click", async () => {
  await renderCustomers();
  const header = () => screen.getByRole("columnheader", { name: /Chance of leaving/ });
  await userEvent.click(screen.getByRole("button", { name: /Chance of leaving/ }));
  expect(header()).toHaveAttribute("aria-sort", "descending");
  expect(listed()).toEqual(["1", "2", "3"]);
  await userEvent.click(screen.getByRole("button", { name: /Chance of leaving/ }));
  expect(header()).toHaveAttribute("aria-sort", "ascending");
  expect(listed()).toEqual(["3", "2", "1"]);
});

test("a two-purchase-day customer carries a marker that explains itself", async () => {
  const evaluation = {
    value_check: [
      {
        bucket: "2",
        min_purchase_days: 2,
        max_purchase_days: 2,
        n: 117,
        predicted_revenue: 133,
        actual_revenue: 100,
        ratio: 1.33,
      },
    ],
  } as EvaluationFile;
  await renderCustomers(
    "/",
    dataWith(
      [
        customerFixture(1, 0.8, 1),
        customerFixture(7, 0.9, 1, 100, 30, {
          features: { ...fixtureFeatures(100, 30), n_purchase_days: 2 },
        }),
      ],
      evaluation,
    ),
  );
  const marker = screen.getByRole("button", { name: "2 buys" });
  act(() => {
    marker.focus();
  });
  expect(await screen.findByRole("tooltip")).toHaveTextContent("overstated their revenue by 33%");
});

test("Download CSV saves the rows in view, named by the scenario", async () => {
  const blobs: Blob[] = [];
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:customers";
    }),
    revokeObjectURL: vi.fn(),
  });
  let saved = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved = this.download;
  });
  await renderCustomers();
  await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
  expect(saved).toBe(`churn-value-customers-${scenarioHash(DEFAULT_SCENARIO)}.csv`);
  const text = await blobs[0]?.text();
  expect(text?.trimEnd().split("\n")).toHaveLength(4); // header + the 3 customers to call
});

test("opening a customer puts them in the link", async () => {
  const router = await renderCustomers("/?g=0.4");
  await userEvent.click(screen.getByRole("button", { name: "Open customer 2" }));
  await waitFor(() => {
    expect(router.state.location.search).toMatchObject({ customer: "2", g: "0.4" });
  });
});

test("when nobody is worth a call, the empty list says why", async () => {
  await renderCustomers("/?g=0");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Under these assumptions no customer is worth a call.",
  );
  expect(
    screen.getByText("No customer is worth a call under these assumptions."),
  ).toBeInTheDocument();
});
