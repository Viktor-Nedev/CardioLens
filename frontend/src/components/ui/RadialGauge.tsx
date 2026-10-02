import { motion } from "motion/react";
import { useId } from "react";
import { riskColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";
import { AnimatedNumber } from "./primitives";

const START = 135; // degrees, measured clockwise from 3 o'clock (SVG coordinates)
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const SPRING = { type: "spring", stiffness: 55, damping: 16, mass: 0.9 } as const;

interface Props {
  value: number;
  threshold: number;
  interval?: [number, number] | null;
  size?: number;
  label?: string;
}

/**
 * Radial probability meter: the fill carries severity (risk colour), the track is a
 * faint step of the same hue, a white tick marks the decision threshold and the outer
 * arc shows the bootstrap interval.
 */
export function RadialGauge({ value, threshold, interval, size = 176, label = "probability" }: Props) {
  const id = useId().replace(/:/g, "");
  const color = riskColor(value);
  const c = size / 2;
  const r = size / 2 - 16;
  const full = arc(c, c, r, START, START + SWEEP);
  const [tx0, ty0] = polar(c, c, r - 9, START + SWEEP * threshold);
  const [tx1, ty1] = polar(c, c, r + 9, START + SWEEP * threshold);
  const [hx, hy] = polar(c, c, r, START + SWEEP * Math.max(0.002, value));
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${pct(value)}`}>
        <defs>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {ticks.map((t) => {
          const [x0, y0] = polar(c, c, r + 12, START + SWEEP * t);
          const [x1, y1] = polar(c, c, r + (t % 0.5 === 0 ? 17 : 15), START + SWEEP * t);
          return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgb(255 255 255 / 0.18)" strokeWidth={1} />;
        })}

        <motion.path
          d={full}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          initial={false}
          animate={{ stroke: withAlpha(color, 0.16) }}
          transition={{ duration: 0.6 }}
        />
        {/* soft glow under the fill */}
        <motion.path
          d={full}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          filter={`url(#glow-${id})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.002, value), stroke: color }}
          transition={SPRING}
          opacity={0.55}
        />
        <motion.path
          d={full}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.002, value), stroke: color }}
          transition={SPRING}
        />
        {interval && (
          <motion.path
            d={arc(c, c, r + 12, START + SWEEP * interval[0], START + SWEEP * Math.max(interval[1], interval[0] + 0.003))}
            fill="none"
            stroke="rgb(178 188 203 / 0.75)"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          />
        )}
        <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
        <motion.circle
          r={5}
          fill="white"
          initial={false}
          animate={{ cx: hx, cy: hy }}
          transition={SPRING}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={value} format={pct} className="text-[40px] font-semibold leading-none tracking-tight text-ink" />
        <span className="mt-1.5 text-[11px] text-ink-3">{label}</span>
      </div>
    </div>
  );
}
