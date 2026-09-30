/** Every page opens with its answer as one sentence, then one paragraph of context. */
export function PageHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="mt-7 mb-6 grid gap-2">
      <h1
        aria-live="polite"
        className="max-w-[34ch] font-serif text-4xl leading-[1.12] text-balance"
      >
        {title}
      </h1>
      <p className="max-w-[70ch] text-base leading-relaxed text-muted">{lede}</p>
    </div>
  );
}
