/** The assumptions (spec §5.6): name, symbol, the value used here, the range, and the source. */
import { ScrollRegion } from "@/components/ScrollRegion.tsx";
import type { EconomicParams } from "@/contract/index.ts";
import { assumptionRows } from "@/domain/method.ts";

export function Assumptions({ economics }: { economics: EconomicParams }) {
  const rows = assumptionRows(economics);
  const cell = "border-b border-rule px-2 py-2 align-top";
  return (
    <section
      aria-labelledby="assumptions-title"
      className="rounded-[10px] bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule)]"
    >
      <h2 id="assumptions-title" className="font-serif text-2xl">
        The assumptions behind every number
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm text-muted">
        The pages let you move each of these; the results on this page use the values below.
      </p>
      <ScrollRegion label="Assumptions, scrollable">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Assumptions</caption>
          <thead>
            <tr>
              {["Parameter", "Symbol", "Value here", "Range", "Source"].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-rule px-2 py-1.5 text-left text-xs font-medium text-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <th scope="row" className={`${cell} text-left font-medium`}>
                  {row.name}
                </th>
                <td className={`${cell} font-serif italic`}>{row.symbol}</td>
                <td className={cell}>{row.value}</td>
                <td className={cell}>{row.range}</td>
                <td className={`${cell} text-muted`}>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </section>
  );
}
