import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MethodPage } from "@/pages/method/MethodPage.tsx";
import { ModelCard } from "@/pages/method/ModelCard.tsx";

import { renderPage } from "../render.tsx";

vi.mock("@/pages/method/ModelCardMarkdown.tsx", () => {
  throw new Error("the chunk did not load");
});

test("if the card's renderer fails to load, the rest of the Method page stays", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // React reports the caught error
  await renderPage(() => <MethodPage card={{ ok: true, text: "# Model card" }} />);
  expect(
    await screen.findByText(/The model card could not be shown: its renderer did not load/),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "What this cannot tell you" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Nobody tells a wholesaler they are leaving. The label has to be built.",
  );
  vi.restoreAllMocks();
});

test("a renderer that did not load offers a reload, which is what can bring it back", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const onReload = vi.fn();
  await renderPage(() => (
    <>
      <h1>Method</h1>
      <ModelCard card={{ ok: true, text: "# Model card" }} onReload={onReload} />
    </>
  ));
  await userEvent.click(await screen.findByRole("button", { name: "Reload the page" }));
  expect(onReload).toHaveBeenCalledTimes(1);
  // React keeps a failed lazy import: a button that only re-rendered could never succeed
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
