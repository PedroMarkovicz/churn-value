import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LabelDiagram } from "@/pages/method/LabelDiagram.tsx";
import { ModelCard } from "@/pages/method/ModelCard.tsx";

import { stubWidth } from "../width.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the label diagram's title is a heading", () => {
  render(<LabelDiagram horizonDays={90} eligibilityF={0.5} />);
  expect(
    screen.getByRole("heading", { level: 2, name: "How a customer gets a label" }),
  ).toBeInTheDocument();
});

test("on a phone, E is written beside the cutoff line, not on it", () => {
  stubWidth(248);
  const { container } = render(<LabelDiagram horizonDays={90} eligibilityF={0.5} />);
  const texts = [...container.querySelectorAll("svg text")];
  const cutoff = texts.find((text) => text.textContent === "cutoff t");
  const expected = texts.find((text) => text.textContent === "E");
  const gap = Number(expected?.getAttribute("x")) - Number(cutoff?.getAttribute("x"));
  expect(expected?.getAttribute("text-anchor")).toBe("start");
  expect(gap).toBeGreaterThanOrEqual(8); // clear of the line and of its stroke
});

test("a model card that could not be read can be asked for again", async () => {
  const onRetry = vi.fn();
  render(<ModelCard card={{ ok: false, reason: "model_card.md: HTTP 503" }} onRetry={onRetry} />);
  expect(
    screen.getByText(/The model card could not be read: model_card.md: HTTP 503/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
