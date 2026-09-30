import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PurchaseHistory } from "@/pages/customers/PurchaseHistory.tsx";
import { Reasons } from "@/pages/customers/Reasons.tsx";

const timeline = {
  customer_id: 2,
  days: [-140, -110, -80, -50, -20, 30],
  revenue: [100, 120, 90, 100, 110, 100],
};
const history = (revealed: boolean) => (
  <PurchaseHistory
    timeline={timeline}
    recencyDays={20}
    cadenceDays={30}
    horizonDays={90}
    churned={false}
    revealed={revealed}
  />
);

test("purchases after the cutoff stay hidden until outcomes are revealed", () => {
  const { container, rerender } = render(history(false));
  const dots = () =>
    [...container.querySelectorAll("circle[data-day]")].map((c) =>
      Number(c.getAttribute("data-day")),
    );
  expect(dots()).toEqual([-140, -110, -80, -50, -20]);
  expect(screen.getByText(/stays hidden until you turn on Show what happened/)).toBeInTheDocument();
  rerender(history(true));
  expect(dots()).toContain(30);
  expect(screen.getByText("Bought again 30 days after the cutoff: stayed.")).toBeInTheDocument();
});

test("the history's title says when the next purchase was due", () => {
  render(history(false));
  expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
    "Their next purchase was due 10 days after the cutoff.",
  );
});

test("the history reads as a table, without the hidden outcome", async () => {
  render(history(false));
  await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.getByRole("cell", { name: "20 days before the cutoff" })).toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "30 days after the cutoff" })).not.toBeInTheDocument();
});

const contributions = [
  { feature: "n_purchase_days", value: 6, shap: -0.21 },
  { feature: "spend_90d", value: 0, shap: 0.16 },
  { feature: "cadence_days", value: 88.4, shap: 0.15 },
];

test("each reason is a fact with its direction, and the title names the strongest risk", () => {
  render(<Reasons contributions={contributions} horizonDays={90} month="September" />);
  expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
    "The strongest reason for risk: no spend in the last 90 days.",
  );
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "6 purchase days so farlowers the risk",
    "No spend in the last 90 daysraises the risk",
    "Reorders about every 88 daysraises the risk",
  ]);
  expect(screen.getByText(/measured against a typical customer in September/)).toBeInTheDocument();
});

test("the reasons read as a table with their SHAP sizes", async () => {
  render(<Reasons contributions={contributions} horizonDays={90} month="September" />);
  await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.getByRole("cell", { name: "−0.21" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "+0.16" })).toBeInTheDocument();
});
