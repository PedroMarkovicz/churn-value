import type { ReactNode } from "react";

/**
 * A horizontally scrolling area (a wide table on a phone) that keyboard users can reach and
 * scroll: WCAG 2.1.1, axe's scrollable-region-focusable.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    // A scroll container must take focus to be scrolled from the keyboard.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div role="region" aria-label={label} tabIndex={0} className="mt-3 overflow-x-auto">
      {children}
    </div>
  );
}
