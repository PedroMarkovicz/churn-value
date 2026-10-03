/**
 * The data colours (spec §3.2), as values the palette check can read. The interface uses the same
 * values through the CSS tokens in styles/index.css; a unit test keeps the two in step.
 */
export const SURFACE = "#ffffff"; // charts sit on panels

/** Categorical, 8 slots, assigned by ladder position (the notebooks use slots 1-5). */
export const MODEL_SLOTS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#0e8ba6",
  "#a0662b",
] as const;

/** Colour of the model at `position` in the manifest's ladder; a ninth model gets none. */
export function modelColor(position: number): string | null {
  return MODEL_SLOTS[position] ?? null;
}

export const MONEY = { profit: "#2f5bd3", loss: "#b8352f", midpoint: "#c9ccd8" } as const;

export const OUTCOME = {
  hit: "#2f5bd3",
  waste: "#9db3ee",
  miss: "#d9423f",
  quiet: "#dcdfea",
} as const;

/**
 * Magnitude (spec §3.2): one blue hue from light to dark for heatmaps (opportunity map, PSI),
 * and a neutral grey for cells with nothing to show.
 */
export const MAGNITUDE = {
  ramp: ["#eef2fc", "#d6e0f8", "#b5c7f2", "#8ea8ea", "#6688e0", "#4169d6", "#2f5bd3", "#23459f"],
  none: "#e7e8ee",
} as const;

/** The drift map's five PSI levels: steps of the magnitude ramp chosen for even contrast. */
export const PSI_LEVEL_COLORS = [
  MAGNITUDE.ramp[1],
  MAGNITUDE.ramp[3],
  MAGNITUDE.ramp[4],
  MAGNITUDE.ramp[5],
  MAGNITUDE.ramp[7],
] as const;
