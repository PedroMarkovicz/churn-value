/** Render the Customers page on fixture data, with a layout the virtualised table can measure. */
import type { AppData } from "@/app/data.ts";
import type { Customer, EvaluationFile } from "@/contract/index.ts";
import { buildTable } from "@/domain/table.ts";
import { CustomersPage } from "@/pages/customers/CustomersPage.tsx";

import { customersFixture, timelinesFixture } from "./fixtures/artifacts.ts";
import { fixtureData, renderPage } from "./render.tsx";

/** TanStack Virtual sizes its window from the scroll element; jsdom lays nothing out. */
export function stubLayout() {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(900);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

export function dataWith(customers: Customer[], evaluation = {} as EvaluationFile): AppData {
  const file = customersFixture(customers);
  return { ...fixtureData(), customers: file, table: buildTable(file), evaluation };
}

export function renderCustomers(url = "/", data = fixtureData()) {
  const timelines = timelinesFixture(data.customers.customers);
  return renderPage(() => <CustomersPage timelines={timelines} />, { url, data });
}
