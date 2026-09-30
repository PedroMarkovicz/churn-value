import { render, screen, waitFor } from "@testing-library/react";

import { type Scorer, useChurnProbability } from "@/workers/inference.ts";

function Probe({
  scorer,
  features,
  timeoutMs,
}: {
  scorer: Scorer | null;
  features: Float64Array | null;
  timeoutMs?: number;
}) {
  const scored = useChurnProbability(scorer, features, timeoutMs);
  return <p>{scored.status === "ready" ? `ready ${scored.p}` : scored.status}</p>;
}

const row = (...values: number[]) => Float64Array.from(values);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("nothing to score is idle, and nothing runs", () => {
  const scorer = vi.fn<Scorer>(() => Promise.resolve(0.5));
  render(<Probe scorer={scorer} features={null} />);
  expect(screen.getByText("idle")).toBeInTheDocument();
  expect(scorer).not.toHaveBeenCalled();
});

test("the answer arrives after a short pause", async () => {
  render(<Probe scorer={() => Promise.resolve(0.42)} features={row(1, 2)} />);
  expect(screen.getByText("running")).toBeInTheDocument();
  expect(await screen.findByText("ready 0.42")).toBeInTheDocument();
});

test("a newer request wins over a slower older one", async () => {
  const scorer: Scorer = async (x) => {
    if (x[0] === 1) {
      await sleep(250);
      return 0.1;
    }
    return 0.2;
  };
  const { rerender } = render(<Probe scorer={scorer} features={row(1)} />);
  await sleep(200); // the first request has started
  rerender(<Probe scorer={scorer} features={row(2)} />);
  expect(await screen.findByText("ready 0.2")).toBeInTheDocument();
  await sleep(300); // the slow first answer lands, and is ignored
  expect(screen.getByText("ready 0.2")).toBeInTheDocument();
});

test("without a scorer the model is unavailable", () => {
  render(<Probe scorer={null} features={row(1)} />);
  expect(screen.getByText("failed")).toBeInTheDocument();
});

test("a failed run is final for the visit", async () => {
  const scorer = vi.fn<Scorer>(() => Promise.reject(new Error("no wasm")));
  const { rerender } = render(<Probe scorer={scorer} features={row(1)} />);
  expect(await screen.findByText("failed")).toBeInTheDocument();
  rerender(<Probe scorer={scorer} features={row(2)} />);
  expect(screen.getByText("failed")).toBeInTheDocument();
});

test("a scorer that never answers gives up instead of spinning", async () => {
  render(
    <Probe scorer={() => new Promise<number>(() => undefined)} features={row(1)} timeoutMs={50} />,
  );
  await waitFor(() => {
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
