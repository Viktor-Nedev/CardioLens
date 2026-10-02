import { ArrowRight, BrainCircuit, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { LOWERS, RAISES, riskColor } from "../../lib/colors";
import { pct, pp, signed } from "../../lib/format";
import { TARGET_ORDER, type Contribution, type TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnimatedNumber, DataTable, EASE_OUT, LegendKey, Section, Segmented } from "../ui/primitives";

const TOP_N = 10;
const BAR_SPRING = { type: "spring", stiffness: 140, damping: 22 } as const;

function ContributionRow({ c, max, index }: { c: Contribution; max: number; index: number }) {
  const [hover, setHover] = useState(false);
  const share = Math.min(1, Math.abs(c.contribution) / max);
  const positive = c.contribution >= 0;
  const color = positive ? RAISES : LOWERS;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{
        layout: { type: "spring", stiffness: 380, damping: 34 },
        opacity: { duration: 0.3, delay: index * 0.03 },
        x: { duration: 0.35, delay: index * 0.03, ease: EASE_OUT },
      }}
      className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04]"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="min-w-0">
        <p className="truncate text-xs text-ink">{c.label}</p>
        <p className="truncate text-[11px] text-ink-3">
          {c.display}
          {c.imputed && " · imputed"}
        </p>
      </div>
      <div className="relative flex h-5 items-center">
        <div className="absolute inset-y-0 left-1/2 w-px bg-axis" />
        <motion.div
          className="absolute top-1/2 h-3 -translate-y-1/2"
          initial={{ width: "0%", left: "50%" }}
          animate={{ width: `${share * 50}%`, left: positive ? "50%" : `${50 - share * 50}%` }}
          transition={BAR_SPRING}
          style={{
            background: `linear-gradient(${positive ? "90deg" : "270deg"}, ${color}cc, ${color})`,
            borderRadius: positive ? "0 4px 4px 0" : "4px 0 0 4px",
            boxShadow: hover ? `0 0 14px ${color}88` : "none",
          }}
        />
        <motion.span
          key={positive ? "raise" : "lower"}
          className="tabular absolute whitespace-nowrap text-[11px] text-ink-2"
          initial={false}
          animate={positive ? { left: `calc(${50 + share * 50}% + 4px)` } : { right: `calc(${50 + share * 50}% + 4px)` }}
          transition={BAR_SPRING}
          style={positive ? { left: "50%" } : { right: "50%" }}
        >
          {pp(c.delta_pp)}
        </motion.span>
      </div>
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute -top-1 left-1/2 z-10 w-60 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-[#0b111bf2] px-3 py-2 shadow-xl"
          >
            <p className="tabular text-sm font-semibold text-ink">{pp(c.delta_pp)}</p>
            <p className="text-[11px] text-ink-2">
              {c.label}: {c.display}
            </p>
            <p className="tabular mt-1 text-[11px] text-ink-3">
              SHAP {signed(c.contribution)} log-odds · {positive ? "raises" : "lowers"} the estimate
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Where the patient lands relative to the average patient; the bar is the net SHAP push. */
function ShiftTrack({ from, to }: { from: number; to: number }) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const up = to >= from;
  const color = up ? RAISES : LOWERS;
  return (
    <div className="relative mx-1 mt-3 h-1.5 rounded-full bg-white/[0.07]" aria-hidden>
      <motion.div
        className="absolute inset-y-0 rounded-full"
        initial={false}
        animate={{ left: `${lo * 100}%`, width: `${Math.max(0.6, (hi - lo) * 100)}%` }}
        transition={BAR_SPRING}
        style={{
          background: up ? `linear-gradient(90deg, ${color}33, ${color})` : `linear-gradient(270deg, ${color}33, ${color})`,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
      <motion.span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-3"
        initial={false}
        animate={{ left: `${from * 100}%` }}
        transition={BAR_SPRING}
        title="Average patient"
      />
      <motion.span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
        initial={false}
        animate={{ left: `${to * 100}%`, backgroundColor: riskColor(to) }}
        transition={BAR_SPRING}
        style={{ boxShadow: `0 0 10px ${riskColor(to)}` }}
        title="This patient"
      />
    </div>
  );
}

export function ExplanationPanel() {
  const prediction = useStore((s) => s.prediction);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const [view, setView] = useState<"chart" | "table">("chart");

  const pred = prediction?.targets[selected];
  const { top, rest, max } = useMemo(() => {
    const list = pred?.contributions ?? [];
    const top = list.slice(0, TOP_N);
    const restList = list.slice(TOP_N);
    const restSum = restList.reduce((a, c) => a + c.contribution, 0);
    const max = Math.max(1e-6, ...top.map((c) => Math.abs(c.contribution)), Math.abs(restSum));
    return { top, rest: { count: restList.length, sum: restSum }, max };
  }, [pred]);

  if (!prediction || !pred) return <div className="panel skeleton h-96" aria-busy="true" />;

  return (
    <Section
      title="Why this estimate?"
      icon={BrainCircuit}
      right={
        <Segmented
          size="xs"
          ariaLabel="Explained target"
          value={selected}
          onChange={(t: TargetId) => select(t)}
          options={TARGET_ORDER.map((t) => ({ value: t, label: prediction.targets[t].short }))}
        />
      }
    >
      <motion.p
        key={selected}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="text-xs leading-relaxed text-ink-2"
      >
        {pred.summary}
      </motion.p>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 py-2 text-xs">
        <span className="text-ink-3">Average patient</span>
        <AnimatedNumber value={pred.base_probability} format={pct} className="tabular font-semibold text-ink" />
        <ArrowRight size={13} className="text-accent" aria-hidden />
        <span className="text-ink-3">This patient</span>
        <AnimatedNumber value={pred.probability} format={pct} className="tabular font-semibold text-ink" />
        <span className="ml-auto truncate text-[11px] text-ink-3">{pred.model}</span>
      </div>
      <ShiftTrack from={pred.base_probability} to={pred.probability} />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-4 text-[11px] text-ink-2">
          <LegendKey kind="rect" color={RAISES} label="Raises risk" />
          <LegendKey kind="rect" color={LOWERS} label="Lowers risk" />
        </div>
        <Segmented
          size="xs"
          ariaLabel="Chart or table view"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      {view === "chart" ? (
        <>
          <ul key={selected} className="mt-2 space-y-0.5">
            <AnimatePresence initial={true}>
              {top.map((c, i) => (
                <ContributionRow key={c.feature} c={c} max={max} index={i} />
              ))}
              {rest.count > 0 && (
                <ContributionRow
                  key="__rest"
                  index={top.length}
                  c={{
                    feature: "__rest",
                    label: `${rest.count} other features`,
                    display: "combined",
                    contribution: rest.sum,
                    delta_pp: 100 * (pred.probability - 1 / (1 + Math.exp(-(pred.logit - rest.sum)))),
                    imputed: false,
                  }}
                  max={max}
                />
              )}
            </AnimatePresence>
          </ul>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
            <Info size={12} className="mt-px shrink-0" aria-hidden />
            Bar length is the SHAP contribution in log-odds (additive: they sum from the average patient to this patient).
            Labels show the approximate change in probability each factor causes.
          </p>
        </>
      ) : (
        <div className="mt-2">
          <DataTable
            head={["Feature", "Value", "SHAP (log-odds)", "≈ Δ probability"]}
            rows={pred.contributions.map((c) => [
              c.label,
              c.display + (c.imputed ? " (imputed)" : ""),
              signed(c.contribution, 3),
              pp(c.delta_pp),
            ])}
          />
        </div>
      )}
    </Section>
  );
}
