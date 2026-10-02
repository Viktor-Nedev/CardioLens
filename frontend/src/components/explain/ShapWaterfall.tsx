import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { LOWERS, RAISES, riskColor } from "../../lib/colors";
import { pct, pp, signed } from "../../lib/format";
import type { TargetPrediction } from "../../lib/types";

const TOP_N = 9;
const ROW_H = 28;
const SPRING = { type: "spring", stiffness: 160, damping: 24 } as const;
const PROB_TICKS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99];

const logit = (p: number) => Math.log(p / (1 - p));

interface Step {
  key: string;
  label: string;
  display: string;
  value: number; // log-odds contribution
  deltaPp: number;
  start: number;
  end: number;
  imputed: boolean;
}

/**
 * SHAP waterfall: starts at the average patient, adds each feature's contribution in
 * calibrated log-odds and ends at this patient. The axis is labelled in probability.
 */
export function ShapWaterfall({ pred }: { pred: TargetPrediction }) {
  const [hover, setHover] = useState<string | null>(null);

  const { steps, domain, ticks } = useMemo(() => {
    const list = pred.contributions;
    const top = list.slice(0, TOP_N);
    const rest = list.slice(TOP_N);
    const restSum = rest.reduce((a, c) => a + c.contribution, 0);
    let cum = pred.base_logit;
    const steps: Step[] = top.map((c) => {
      const start = cum;
      cum += c.contribution;
      return {
        key: c.feature,
        label: c.label,
        display: c.display,
        value: c.contribution,
        deltaPp: c.delta_pp,
        start,
        end: cum,
        imputed: c.imputed,
      };
    });
    if (rest.length) {
      const start = cum;
      cum += restSum;
      steps.push({
        key: "__rest",
        label: `${rest.length} other features`,
        display: "combined",
        value: restSum,
        deltaPp: 100 * (1 / (1 + Math.exp(-cum)) - 1 / (1 + Math.exp(-start))),
        start,
        end: cum,
        imputed: false,
      });
    }
    const xs = [pred.base_logit, pred.logit, ...steps.flatMap((s) => [s.start, s.end])];
    let lo = Math.min(...xs);
    let hi = Math.max(...xs);
    const pad = Math.max(0.35, (hi - lo) * 0.08);
    lo -= pad;
    hi += pad;
    // Probability ticks are crowded near 0% / 100% on a log-odds axis: keep only
    // ticks at least 13% of the axis width apart.
    const ticks: number[] = [];
    for (const p of PROB_TICKS) {
      const t = logit(p);
      if (t < lo || t > hi) continue;
      const pos = (t - lo) / (hi - lo);
      const last = ticks.length ? (logit(ticks[ticks.length - 1]) - lo) / (hi - lo) : -1;
      if (pos - last >= 0.13) ticks.push(p);
    }
    return { steps, domain: [lo, hi] as const, ticks };
  }, [pred]);

  const x = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * 100;
  const rows = steps.length + 2;

  return (
    <div className="mt-2" role="img" aria-label={`SHAP waterfall from ${pct(pred.base_probability)} to ${pct(pred.probability)}`}>
      <div className="relative grid grid-cols-[42%_58%]">
        {/* gridlines + axis live in the chart column */}
        <div className="pointer-events-none absolute inset-y-0 left-[42%] right-0" aria-hidden>
          {ticks.map((p) => (
            <div key={p} className="absolute inset-y-0 w-px bg-grid" style={{ left: `${x(logit(p))}%` }} />
          ))}
        </div>

        {/* average patient */}
        <div className="flex items-center pr-2 text-[11px] text-ink-3" style={{ height: ROW_H }}>
          Average patient
        </div>
        <div className="relative" style={{ height: ROW_H }}>
          <motion.span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-3"
            initial={false}
            animate={{ left: `${x(pred.base_logit)}%` }}
            transition={SPRING}
          />
          <motion.span
            className="tabular absolute top-1/2 -translate-y-1/2 pl-2 text-[11px] font-semibold text-ink-2"
            initial={false}
            animate={{ left: `${x(pred.base_logit)}%` }}
            transition={SPRING}
          >
            {pct(pred.base_probability)}
          </motion.span>
        </div>

        <AnimatePresence initial={true}>
          {steps.map((s, i) => {
            const up = s.value >= 0;
            const color = up ? RAISES : LOWERS;
            const left = x(Math.min(s.start, s.end));
            const width = Math.max(0.4, Math.abs(x(s.end) - x(s.start)));
            const active = hover === s.key;
            // Label beside the bar, on whichever side has room inside the chart.
            const labelLeft = up ? x(s.end) > 80 : x(s.end) >= 20;
            return (
              <motion.div
                key={s.key}
                layout="position"
                className={`col-span-2 grid grid-cols-[42%_58%] rounded-md ${active ? "bg-white/[0.04]" : ""}`}
                style={{ height: ROW_H }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 380, damping: 34 },
                  opacity: { duration: 0.3, delay: 0.04 * i },
                  x: { duration: 0.35, delay: 0.04 * i },
                }}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
                tabIndex={0}
              >
                <div className="min-w-0 pl-1 pr-2">
                  <p className="truncate pt-0.5 text-xs leading-tight text-ink">{s.label}</p>
                  <p className="truncate text-[10px] leading-tight text-ink-3">
                    {s.display}
                    {s.imputed && " · imputed"}
                  </p>
                </div>
                <div className="relative">
                  {/* connector from the previous step's end */}
                  <motion.span
                    className="absolute w-px bg-ink-3/50"
                    initial={false}
                    animate={{ left: `${x(s.start)}%` }}
                    transition={SPRING}
                    style={{ top: -ROW_H / 2 + 6, height: ROW_H / 2 }}
                    aria-hidden
                  />
                  <motion.div
                    className="absolute top-1/2 h-3 -translate-y-1/2"
                    initial={{ left: `${x(s.start)}%`, width: "0%" }}
                    animate={{ left: `${left}%`, width: `${width}%` }}
                    transition={{ ...SPRING, delay: 0.05 * i }}
                    style={{
                      background: `linear-gradient(${up ? "90deg" : "270deg"}, ${color}b3, ${color})`,
                      borderRadius: up ? "2px 4px 4px 2px" : "4px 2px 2px 4px",
                      boxShadow: active ? `0 0 14px ${color}aa` : "none",
                    }}
                  />
                  <motion.span
                    key={labelLeft ? "left" : "right"}
                    className="tabular absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-2"
                    initial={false}
                    animate={
                      labelLeft
                        ? { right: `calc(${100 - Math.min(x(s.start), x(s.end))}% + 4px)` }
                        : { left: `calc(${Math.max(x(s.start), x(s.end))}% + 4px)` }
                    }
                    transition={SPRING}
                  >
                    {pp(s.deltaPp)}
                  </motion.span>
                  <AnimatePresence>
                    {active && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none absolute -top-1 left-1/2 z-20 w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-[#0b111bf2] px-3 py-2 shadow-xl"
                      >
                        <p className="tabular text-sm font-semibold text-ink">{pp(s.deltaPp)}</p>
                        <p className="text-[11px] text-ink-2">
                          {s.label}: {s.display}
                        </p>
                        <p className="tabular mt-1 text-[11px] text-ink-3">
                          SHAP {signed(s.value)} log-odds · {pct(1 / (1 + Math.exp(-s.start)))} →{" "}
                          {pct(1 / (1 + Math.exp(-s.end)))}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* this patient */}
        <div className="flex items-center pr-2 text-[11px] font-semibold text-ink" style={{ height: ROW_H }}>
          This patient
        </div>
        <div className="relative" style={{ height: ROW_H }}>
          <motion.span
            className="absolute w-px bg-ink-3/50"
            initial={false}
            animate={{ left: `${x(pred.logit)}%` }}
            transition={SPRING}
            style={{ top: -ROW_H / 2 + 6, height: ROW_H / 2 }}
            aria-hidden
          />
          <motion.span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
            initial={false}
            animate={{ left: `${x(pred.logit)}%`, backgroundColor: riskColor(pred.probability) }}
            transition={SPRING}
            style={{ boxShadow: `0 0 12px ${riskColor(pred.probability)}` }}
          />
          <motion.span
            className={`tabular absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink ${
              x(pred.logit) > 80 ? "-translate-x-full pr-3" : "pl-3"
            }`}
            initial={false}
            animate={{ left: `${x(pred.logit)}%` }}
            transition={SPRING}
          >
            {pct(pred.probability)}
          </motion.span>
        </div>
      </div>

      {/* probability axis */}
      <div className="grid grid-cols-[42%_58%]" aria-hidden>
        <span />
        <div className="relative mt-1 h-4 border-t border-axis">
          {ticks.map((p) => (
            <span
              key={p}
              className="tabular absolute top-1 -translate-x-1/2 text-[10px] text-ink-3"
              style={{ left: `${x(logit(p))}%` }}
            >
              {Math.round(p * 100)}%
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{rows} steps from the average patient to this patient.</p>
    </div>
  );
}
