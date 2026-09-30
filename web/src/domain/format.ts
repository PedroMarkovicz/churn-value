/**
 * Number formatting (spec §7): pounds with a true minus sign, compact amounts only on axes and
 * tooltips, and never NaN, Infinity or -0 on screen.
 */
const MINUS = "−";

function finite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value === 0 ? 0 : value; // folds -0 into 0
}

function signed(value: number, body: (abs: number) => string): string {
  const v = finite(value);
  return `${v < 0 ? MINUS : ""}${body(Math.abs(v))}`;
}

const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const pence = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** £23,139 and −£128,345. */
export function money(value: number): string {
  const rounded = Math.round(finite(value));
  return signed(rounded, (abs) => `£${whole.format(abs)}`);
}

/** £20.59, for per-customer amounts. */
export function moneyPrecise(value: number): string {
  const rounded = Math.round(finite(value) * 100) / 100;
  return signed(rounded, (abs) => `£${pence.format(abs)}`);
}

/** £40k, −£128k, £1.2m: axes and tooltips only. */
export function moneyCompact(value: number): string {
  return signed(finite(value), (abs) => {
    if (abs >= 1e6) return `£${trim(abs / 1e6)}m`;
    if (abs >= 1e3) return `£${trim(abs / 1e3)}k`;
    return `£${whole.format(abs)}`;
  });
}

function trim(value: number): string {
  const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** 30% (digits = 0) or 17.2% (digits = 1). */
export function percent(fraction: number, digits = 0): string {
  const v = finite(fraction) * 100;
  const text = v.toFixed(digits);
  return `${Number(text) === 0 ? (0).toFixed(digits) : text.replace("-", MINUS)}%`;
}

/** +12.6 and −1.8: differences in percentage points. */
export function points(fraction: number, digits = 1): string {
  const v = Number((finite(fraction) * 100).toFixed(digits));
  if (v === 0) return (0).toFixed(digits);
  return `${v > 0 ? "+" : MINUS}${Math.abs(v).toFixed(digits)}`;
}

/** 1,920 */
export function count(value: number): string {
  return whole.format(Math.round(finite(value)));
}

/** "1 day", "34 days": durations in whole days. */
export function days(value: number): string {
  const rounded = Math.round(finite(value));
  return rounded === 1 ? "1 day" : `${count(rounded)} days`;
}
