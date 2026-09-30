/** A number that counts to its new value (spec §3.5), or jumps there when motion is reduced. */
import { useEffect, useRef, useState } from "react";

const reducedMotion = () =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  value: number;
  format: (value: number) => string;
  duration?: number;
}

export function AnimatedNumber({ value, format, duration = 300 }: Props) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const instant = reducedMotion();
  useEffect(() => {
    if (instant) {
      from.current = value;
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const current = origin + (value - origin) * (1 - (1 - t) ** 3);
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, duration, instant]);
  return <>{format(instant ? value : shown)}</>;
}
