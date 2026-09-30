/**
 * The drawer (spec §5.4): one customer, from the verdict to the what-if. A modal dialog: it traps
 * focus, Esc and Close shut it, and focus returns to where it was. 440 px on desktop, the full
 * screen on a phone.
 */
import { Dialog } from "radix-ui";

import type { Customer, FeatureSpec, Timeline } from "@/contract/index.ts";
import type { CustomerRow } from "@/domain/customerList.ts";
import { customerStory, monthName, verdict } from "@/domain/customerText.ts";
import { count } from "@/domain/format.ts";
import type { Scenario } from "@/scenario/schema.ts";

import { Gauge } from "./Gauge.tsx";
import { MoneyBlock } from "./MoneyBlock.tsx";
import { PurchaseHistory } from "./PurchaseHistory.tsx";
import { Reasons } from "./Reasons.tsx";

export interface DrawerProps {
  row: CustomerRow;
  customer: Customer;
  timeline: Timeline | undefined;
  scenario: Scenario;
  featureSpec: FeatureSpec;
  total: number; // customers in the holdout
  cutoff: string;
  horizonDays: number;
  revealed: boolean;
  onClose: () => void;
}

export function CustomerDrawer({
  row,
  customer,
  timeline,
  scenario,
  total,
  cutoff,
  horizonDays,
  revealed,
  onClose,
}: DrawerProps) {
  const cadenceCv = customer.features.cadence_cv ?? 0;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-ink/25" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-30 grid w-full animate-drawer-in content-start gap-8 overflow-y-auto bg-panel px-5 py-6 shadow-[-8px_0_24px_rgba(26,32,64,0.12)] outline-none sm:px-6 md:w-[440px]">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">
                Rank {count(row.rank)} of {count(total)},{" "}
                {row.isUk ? "United Kingdom" : "outside the United Kingdom"}
              </p>
              <Dialog.Title className="font-serif text-4xl leading-tight">
                Customer {row.id}
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded-md px-3 py-1.5 text-sm font-semibold text-accent shadow-[inset_0_0_0_1px_var(--color-rule)]">
              Close
            </Dialog.Close>
          </header>
          <Dialog.Description className="text-base leading-relaxed">
            <b>{verdict(row.decision)}</b>{" "}
            {customerStory(row, cadenceCv, scenario.value_horizon_days)}
          </Dialog.Description>
          <Gauge p={row.p} breakEven={row.breakEven} />
          <MoneyBlock row={row} scenario={scenario} />
          {timeline && (
            <PurchaseHistory
              timeline={timeline}
              recencyDays={row.recencyDays}
              cadenceDays={row.cadenceDays}
              horizonDays={horizonDays}
              churned={row.churned}
              revealed={revealed}
            />
          )}
          <Reasons
            contributions={customer.top_contributions}
            horizonDays={horizonDays}
            month={monthName(cutoff)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
