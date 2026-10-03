/**
 * The model card's Markdown, rendered with GitHub tables and anchored headings. Loaded lazily
 * (react-markdown is the heaviest thing on the page). Raw HTML in the Markdown is never
 * rendered: react-markdown escapes it, and no raw-HTML plugin is added.
 */
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { ScrollRegion } from "@/components/ScrollRegion.tsx";

// The card's own headings sit one level under the page's section heading.
const COMPONENTS: Components = {
  // The section is already titled "Model card"; the card's own title would repeat it.
  h1: () => null,
  h2: ({ id, children }) => (
    <h3 id={id} className="mt-6 font-serif text-xl">
      {children}
    </h3>
  ),
  h3: ({ id, children }) => (
    <h4 id={id} className="mt-4 font-semibold">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="mt-3 max-w-[72ch] leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 grid list-disc gap-1 pl-5">{children}</ul>,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-rule pl-3 text-sm text-muted">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <ScrollRegion label="Model card table, scrollable">
      {/* Tables keep their natural width and scroll; only running text wraps long codes. */}
      <table className="w-full min-w-max border-collapse text-sm [&_code]:[overflow-wrap:normal]">
        {children}
      </table>
    </ScrollRegion>
  ),
  th: ({ children }) => (
    <th
      scope="col"
      className="border-b border-rule px-2 py-1.5 text-left text-xs font-medium text-muted"
    >
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-rule px-2 py-1.5">{children}</td>,
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 text-[0.9em] [overflow-wrap:anywhere]">
      {children}
    </code>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
};

export function ModelCardMarkdown({ text }: { text: string }): ReactNode {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={COMPONENTS}>
      {text}
    </Markdown>
  );
}
