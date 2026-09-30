/**
 * Plain query strings (?g=0.45&bm=calls): TanStack Router's default JSON encoding would quote
 * strings (bm=%22calls%22), which makes shared links ugly. Values stay strings; parsers coerce.
 */
export function parseSearch(query: string): Record<string, unknown> {
  return Object.fromEntries(new URLSearchParams(query));
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
