/**
 * The open customer lives in the URL (?customer=ID, spec §5.4) so it can be shared. Opening and
 * closing push history entries: Back closes the drawer, Forward opens it again.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

export function useCustomerParam(indexById: ReadonlyMap<number, number>) {
  const search: Record<string, unknown> = useSearch({ strict: false });
  const navigate = useNavigate();
  const raw = search.customer;
  const text = typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
  const id = text !== null && /^\d+$/.test(text) ? Number(text) : null;
  const index = id === null ? undefined : indexById.get(id);

  const open = useCallback(
    (next: number) => {
      void navigate({
        to: ".",
        resetScroll: false,
        search: (previous: Record<string, unknown>) => ({ ...previous, customer: String(next) }),
      });
    },
    [navigate],
  );
  const close = useCallback(() => {
    void navigate({
      to: ".",
      resetScroll: false,
      search: (previous: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "customer")),
    });
  }, [navigate]);

  return {
    id: index === undefined ? null : id,
    index,
    unknown: text !== null && index === undefined ? text : null, // in the link, not in the data
    open,
    close,
  };
}
