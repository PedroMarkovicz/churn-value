import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Reasons } from "@/pages/customers/Reasons.tsx";

test("a reason that rounds to zero is listed with no effect, in the list and in the table", async () => {
  render(
    <Reasons
      contributions={[
        { feature: "spend_90d", value: 0, shap: 0.16 },
        { feature: "n_purchase_days", value: 6, shap: -0.001 },
      ]}
      horizonDays={90}
      month="September"
    />,
  );
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "No spend in the last 90 daysraises the risk",
    "6 purchase days so farno effect",
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
  const cells = screen.getAllByRole("cell").map((cell) => cell.textContent);
  expect(cells).toContain("no effect");
  expect(cells).toContain("0.00");
  expect(cells).not.toContain("−0.00");
});
