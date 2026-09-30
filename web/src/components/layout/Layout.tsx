import { Link, Outlet, useLoaderData } from "@tanstack/react-router";
import { useState } from "react";

import type { AppData } from "@/app/data.ts";
import { ScenarioStrip } from "@/components/scenario/ScenarioStrip.tsx";
import { ScenarioProvider, useScenario } from "@/scenario/ScenarioProvider.tsx";
import { PARAMETER_ORDER, PARAMETERS } from "@/scenario/schema.ts";

/** The pages of this release, in navigation order. */
export const PAGES = [
  { to: "/", label: "Overview" },
  { to: "/simulator", label: "Simulator" },
  { to: "/sensitivity", label: "Sensitivity" },
  { to: "/customers", label: "Customers" },
] as const;

export function useAppData(): AppData {
  return useLoaderData({ from: "__root__" });
}

function InvalidNotice() {
  const { invalid } = useScenario();
  const [dismissed, setDismissed] = useState(false);
  if (invalid.length === 0 || dismissed) return null;
  const labels = PARAMETER_ORDER.filter((name) => invalid.includes(PARAMETERS[name].key)).map(
    (name) => PARAMETERS[name].label.toLowerCase(),
  );
  if (invalid.includes("bm") || invalid.includes("bv")) labels.push("budget");
  return (
    <div
      role="status"
      className="mt-4 flex items-start justify-between gap-4 rounded-lg bg-accent-tint px-4 py-3 text-sm"
    >
      <p>
        Some values in this link were out of range and were reset to their defaults:{" "}
        {labels.join(", ")}.
      </p>
      <button
        type="button"
        className="font-semibold text-accent"
        onClick={() => {
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

function Footer({ data }: { data: AppData }) {
  const deployed = data.manifest.models.find((m) => m.deployable);
  return (
    <footer className="mt-16 grid gap-1 border-t border-rule pt-5 text-xs leading-relaxed text-muted">
      <p>
        Data: Online Retail II, Chen, D. (2012), UCI Machine Learning Repository,{" "}
        <a
          className="text-accent underline underline-offset-2"
          href="https://doi.org/10.24432/C5CG6D"
        >
          doi:10.24432/C5CG6D
        </a>
        , licensed CC BY 4.0. Amounts in pounds, as in the data.
      </p>
      <p>
        Scored by {deployed?.label ?? data.manifest.deployed_model} on the{" "}
        {data.manifest.test_cutoff} holdout. Contract {data.manifest.contract_version}, built from
        commit {data.manifest.git_sha.slice(0, 7)}.{" "}
        <a
          className="text-accent underline underline-offset-2"
          href="https://github.com/PedroMarkovicz/churn-value"
        >
          Source on GitHub
        </a>
      </p>
    </footer>
  );
}

export function Layout() {
  const data = useAppData();
  return (
    <ScenarioProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6">
        <header className="grid gap-3 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/" search={(previous) => previous} className="font-serif text-lg">
              churn-value
            </Link>
            <nav aria-label="Pages">
              <ul className="flex gap-5 text-sm text-muted">
                {PAGES.map((page) => (
                  <li key={page.to}>
                    <Link
                      to={page.to}
                      search={(previous) => previous}
                      activeOptions={{ exact: true, includeSearch: false }}
                      activeProps={{
                        className:
                          "font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]",
                        "aria-current": "page",
                      }}
                      className="inline-block py-1.5"
                    >
                      {page.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <ScenarioStrip />
        </header>
        <InvalidNotice />
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
        <Footer data={data} />
      </div>
    </ScenarioProvider>
  );
}
