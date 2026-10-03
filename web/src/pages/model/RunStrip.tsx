/**
 * The reproducible run (spec §5.5): trials, seed, folds, code, data and contract of the served
 * release, the experiment runs in a dialog, and the way to the model card.
 */
import { Link } from "@tanstack/react-router";
import { Dialog } from "radix-ui";

import type { ExperimentsFile, Manifest } from "@/contract/index.ts";
import { experimentRows, runFacts, runSentence } from "@/domain/model.ts";

const fixed = (value: number | null, digits: number) =>
  value === null ? "–" : value.toFixed(digits);

export function RunStrip({
  manifest,
  experiments,
}: {
  manifest: Manifest;
  experiments: ExperimentsFile;
}) {
  const facts = runFacts(manifest);
  const runs = experimentRows(experiments, manifest.models);
  return (
    <section
      aria-label="Reproducible run"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] bg-panel px-5 py-4 text-sm shadow-[0_0_0_1px_var(--color-rule)]"
    >
      <p className="font-semibold">{runSentence(facts)}</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
        <div className="flex gap-1.5">
          <dt>Code</dt>
          <dd className="font-mono text-ink">{facts.gitSha.slice(0, 7)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Data</dt>
          <dd className="font-mono text-ink">{facts.dataSha.slice(0, 8)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Contract</dt>
          <dd className="text-ink">{facts.contract}</dd>
        </div>
      </dl>
      <span className="flex gap-4 sm:ml-auto">
        <Dialog.Root>
          <Dialog.Trigger className="font-semibold text-accent">Experiment runs</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-20 bg-ink/25" />
            <Dialog.Content className="fixed top-1/2 left-1/2 z-30 max-h-[85vh] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-panel p-6 shadow-[0_12px_32px_rgba(26,32,64,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="font-serif text-2xl">Experiment runs</Dialog.Title>
                <Dialog.Close className="text-sm font-semibold text-accent">Close</Dialog.Close>
              </div>
              <Dialog.Description className="mt-1 text-sm text-muted">
                The tuned models of this release, as logged by MLflow: their tuned parameters and
                the mean of their rolling-origin validation folds.
              </Dialog.Description>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {[
                        "Model",
                        "Validation log loss",
                        "Fold ROC-AUC",
                        "Fold PR-AUC",
                        "Trials",
                        "Tuned parameters",
                      ].map((column, i) => (
                        <th
                          key={column}
                          scope="col"
                          className={`border-b border-rule px-2 py-1.5 text-xs font-medium text-muted ${i === 0 || i === 5 ? "text-left" : "text-right"}`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.runId}>
                        <td className="border-b border-rule px-2 py-1.5">{run.label}</td>
                        <td className="border-b border-rule px-2 py-1.5 text-right">
                          {fixed(run.cvLogLoss, 4)}
                        </td>
                        <td className="border-b border-rule px-2 py-1.5 text-right">
                          {fixed(run.foldRocAuc, 3)}
                        </td>
                        <td className="border-b border-rule px-2 py-1.5 text-right">
                          {fixed(run.foldPrAuc, 3)}
                        </td>
                        <td className="border-b border-rule px-2 py-1.5 text-right">
                          {run.trials}
                        </td>
                        <td className="border-b border-rule px-2 py-1.5">
                          {run.params.map(([name, value]) => `${name} ${value}`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Link
          to="/method"
          hash="model-card"
          search={(previous) => previous}
          className="font-semibold text-accent underline underline-offset-2"
        >
          Model card
        </Link>
      </span>
    </section>
  );
}
