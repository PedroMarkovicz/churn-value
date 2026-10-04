/** Failure and emptiness as direction (spec §7): say what went wrong and what to do. */
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { ARTIFACTS_TAG } from "@/app/release.ts";
import { SITE_NAME } from "@/app/title.ts";
import { PAGES } from "@/components/layout/Layout.tsx";
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
          <code className="rounded bg-panel px-1.5 py-0.5">{error.artifact}</code>: {error.reason}.{" "}
          {error.retryable
            ? "The site reads the artifacts published by the pipeline; if they were just updated, a retry usually fixes it."
            : "The site and the artifacts release do not match; a retry will not fix it."}
        </p>
      ) : null}
      {known ? (
        <p className="text-sm text-muted">Pinned artifacts release: {ARTIFACTS_TAG}.</p>
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
  useEffect(() => {
    document.title = `Page not found · ${SITE_NAME}`;
  }, []);
  return (
    <Shell title="There is no page at this address.">
      <p className="text-base">These are the pages of the site:</p>
      <nav aria-label="Pages">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {PAGES.map((page) => (
            <li key={page.to}>
              <Link to={page.to} className="text-accent underline underline-offset-2">
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Shell>
  );
}

/**
 * A page that failed to render (spec §7): name it, say why, and offer a retry and the way back.
 * It renders inside the layout, so the navigation and the other pages keep working.
 */
export function PageErrorPage({
  page,
  error,
  reset,
}: {
  page: string;
  error: unknown;
  reset: () => void;
}) {
  const router = useRouter();
  const reason =
    error instanceof ArtifactError
      ? `${error.artifact}: ${error.reason}. Pinned artifacts release: ${ARTIFACTS_TAG}.`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div className="grid max-w-[720px] gap-4 py-16">
      <h1 className="font-serif text-4xl leading-tight">The {page} page could not be shown.</h1>
      <p className="text-base leading-relaxed">{reason}</p>
      <div className="flex flex-wrap items-center gap-5">
        <button
          type="button"
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-panel"
          onClick={() => {
            // A failed loader throws again after a bare reset: reload the data, then the boundary.
            void router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
        <Link to="/" className="text-accent underline underline-offset-2">
          Back to the Overview
        </Link>
      </div>
    </div>
  );
}

export function pageError(page: string) {
  return function PageError({ error, reset }: ErrorComponentProps) {
    return <PageErrorPage page={page} error={error} reset={reset} />;
  };
}

export function LoadingPage() {
  return (
    <div role="status" className="px-4 py-20 text-center text-sm text-muted">
      Loading the holdout customers…
    </div>
  );
}
