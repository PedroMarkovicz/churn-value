export const SITE_NAME = "churn-value";

/** The browser tab's title for an address: "Simulator · churn-value"; an unknown one says so. */
export function pageTitle(
  pathname: string,
  pages: readonly { to: string; label: string }[],
): string {
  // as the router does: a trailing slash and the letters' case do not change the page
  const path = (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname).toLowerCase();
  const page = pages.find((candidate) => candidate.to === path);
  return `${page ? page.label : "Page not found"} · ${SITE_NAME}`;
}
