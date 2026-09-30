/**
 * The e2e tests check the site against numbers computed here, independently of the app's code:
 * straight from the installed artifacts and the Python evaluation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../../public/data/", import.meta.url));

interface Customer {
  churn: number;
  p: Record<string, number>;
  aov_gg: number;
  cadence_days: number;
}
interface Policy {
  policy: string;
  n_contacted: number;
  realized_profit: number;
  expected_profit: number | null;
}

export const customers = JSON.parse(readFileSync(`${DATA}customers.json`, "utf8")) as {
  deployed_model: string;
  customers: Customer[];
};
export const evaluation = JSON.parse(readFileSync(`${DATA}evaluation.json`, "utf8")) as {
  policies: Policy[];
};

export function deployedPolicy(): Policy {
  const row = evaluation.policies.find((p) => p.policy === customers.deployed_model);
  if (!row) throw new Error("the evaluation has no row for the deployed model");
  return row;
}

/** £23,139 with the true minus sign, as the site writes money. */
export function gbp(value: number): string {
  const text = `£${Math.round(Math.abs(value)).toLocaleString("en-GB")}`;
  return value < 0 ? `\u2212${text}` : text;
}

/** Break-even acceptance of the default-economics list built for `gamma` (design §4). */
export function breakEven(gamma: number): number {
  const [m, lc, la, c, t] = [0.35, 0.1, 10, 1, 365];
  let gain = 0;
  let loss = 0;
  for (const row of customers.customers) {
    const v = m * row.aov_gg * (t / row.cadence_days);
    const crc = lc * v;
    const b = Math.min(v, la * crc);
    const p = row.p[customers.deployed_model] ?? 0;
    if (p * gamma * (b - crc) - (1 - p) * crc - c <= 0) continue;
    loss += c;
    if (row.churn === 1) gain += b - crc;
    else loss += crc;
  }
  return loss / gain;
}
