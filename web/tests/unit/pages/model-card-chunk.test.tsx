import { screen } from "@testing-library/react";

import { MethodPage } from "@/pages/method/MethodPage.tsx";

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
