/**
 * Palette checks for the data colours (spec §3.2): perceptual distances in OKLab under normal
 * vision and simulated colour-vision deficiency (Machado, Oliveira & Fernandes 2009, severity 1),
 * the OKLCH lightness band and chroma floor, and WCAG contrast against the chart surface.
 */
type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function linearRgb(hex: string): Rgb {
  return hexToRgb(hex).map(toLinear) as Rgb;
}

export function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const CVD: Record<"protan" | "deutan" | "tritan", Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(rgb: Rgb, matrix: Matrix): Rgb {
  return matrix.map((row) =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
  ) as Rgb;
}

/** Euclidean distance in OKLab, x100, optionally after simulating a deficiency. */
export function deltaE(a: string, b: string, vision?: keyof typeof CVD): number {
  const see = (hex: string) => {
    const rgb = linearRgb(hex);
    return oklab(vision ? simulate(rgb, CVD[vision]) : rgb);
  };
  const [x, y] = [see(a), see(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function lightnessChroma(hex: string): { l: number; c: number } {
  const [l, a, b] = oklab(linearRgb(hex));
  return { l, c: Math.hypot(a, b) };
}

export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = linearRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type Level = "pass" | "warn" | "fail";
export interface Finding {
  check: string;
  level: Level;
  detail: string;
}

/** The dataviz checks for colours shown side by side (adjacent pairs), on `surface`. */
export function checkPalette(colors: readonly string[], surface: string): Finding[] {
  const findings: Finding[] = [];
  for (const hex of colors) {
    const { l, c } = lightnessChroma(hex);
    if (l < 0.43 || l > 0.77)
      findings.push({ check: "lightness band", level: "fail", detail: `${hex} L ${l.toFixed(3)}` });
    if (c < 0.1)
      findings.push({ check: "chroma floor", level: "fail", detail: `${hex} C ${c.toFixed(3)}` });
    const ratio = contrast(hex, surface);
    if (ratio < 3)
      findings.push({ check: "contrast", level: "warn", detail: `${hex} ${ratio.toFixed(2)}:1` });
  }
  for (let i = 1; i < colors.length; i++) {
    const [a, b] = [colors[i - 1] as string, colors[i] as string];
    const normal = deltaE(a, b);
    if (normal < 15)
      findings.push({
        check: "normal vision",
        level: "fail",
        detail: `${a}/${b} ΔE ${normal.toFixed(1)}`,
      });
    const worst = Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"));
    if (worst < 6)
      findings.push({
        check: "colour-blind separation",
        level: "fail",
        detail: `${a}/${b} ΔE ${worst.toFixed(1)}`,
      });
    else if (worst < 8)
      findings.push({
        check: "colour-blind separation",
        level: "warn",
        detail: `${a}/${b} ΔE ${worst.toFixed(1)}`,
      });
  }
  return findings;
}
