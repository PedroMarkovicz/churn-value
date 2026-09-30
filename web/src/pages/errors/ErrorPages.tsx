/** Failure and emptiness as direction (spec §7): say what went wrong and what to do. */
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";

import { ArtifactError } from "@/contract/load.ts";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 px-4 py-20">
      <p className="font-serif text-lg">churn-value</p>
      <h1 className="font-serif text-4xl leading-tight">{title}</h1>
      {children}
    </div>
  );
}

export function DataErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter();
  const known = error instanceof ArtifactError;
  return (
    <Shell
      title={known ? "The data for this page could not be read." : "This page failed to load."}
    >
      {known ? (
        <p className="text-base leading-relaxed">
          <code className="rounded bg-panel px-1.5 py-0.5">{error.artifact}</code>: {error.reason}.
          The site reads the artifacts published by the pipeline; if they were just updated, a retry
          usually fixes it.
        </p>
      ) : (
        <p className="text-base leading-relaxed">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <div>
        <button
          type="button"
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-panel"
          onClick={() => {
            void router.invalidate();
          }}
        >
          Try again
        </button>
      </div>
    </Shell>
  );
}

export function NotFoundPage() {
  return (
    <Shell title="There is no page at this address.">
      <p className="text-base">
        Start from the{" "}
        <Link to="/" className="text-accent underline underline-offset-2">
          overview
        </Link>
        .
      </p>
    </Shell>
  );
}

export function LoadingPage() {
  return (
    <div role="status" className="px-4 py-20 text-center text-sm text-muted">
      Loading the holdout customers…
    </div>
  );
}
