import { Info, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { LOWERS, RAISES, withAlpha } from "../../lib/colors";
import { rate, signed } from "../../lib/format";
import type { LimeResult, LimeTarget, LimeWeight, TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnimatedNumber, DataTable, EASE_OUT, Segmented } from "../ui/primitives";

const TOP = 8;
const ROW = 32;
const LABEL_W = 152;
const AXIS_H = 26;
const R = 5;
const SPRING = { type: "spring", stiffness: 120, damping: 18 } as const;

// Results per patient, so switching views or targets does not re-run the sampler.
const cache = new Map<string, LimeResult>();

function verdict(t: LimeTarget) {
  if (t.correlation >= 0.9 && t.top_overlap >= t.top_n - 1 && t.sign_agreement >= 0.9)
    return { label: "Strong agreement", icon: ShieldCheck, color: "#199e70" };
  if (t.correlation >= 0.7) return { label: "Moderate agreement", icon: TriangleAlert, color: "#c98500" };
  return { label: "Weak agreement: read with caution", icon: TriangleAlert, color: "#d03b3b" };
}

function Stat({ label, value, format, hint }: { label: string; value: number; format: (v: number) => string; hint: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 px-2.5 py-2" title={hint}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <AnimatedNumber value={value} format={format} className="tabular mt-0.5 block text-base font-semibold text-ink" />
    </div>
  );
}

/** One row per factor: SHAP (filled dot) and LIME (ring) on a shared log-odds axis. */
function Dumbbell({ rows, max, width }: { rows: LimeWeight[]; max: number; width: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(120, width - LABEL_W - 12);
  const sx = (v: number) => LABEL_W + ((v + max) / (2 * max)) * plotW;
  const height = rows.length * ROW + AXIS_H;
  const ticks = [-max, -max / 2, 0, max / 2, max];

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label="SHAP and LIME contributions for the main factors">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={sx(t)}
              x2={sx(t)}
              y1={0}
              y2={rows.length * ROW}
              stroke={t === 0 ? "var(--color-axis)" : "var(--color-grid)"}
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text
              x={sx(t)}
              y={rows.length * ROW + 14}
              textAnchor={t === -max ? "start" : t === max ? "end" : "middle"}
              fontSize={10}
              fill="var(--color-ink-3)"
            >
              {t === 0 ? "0" : signed(t, 1)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = i * ROW + ROW / 2;
          const xs = sx(r.shap);
          const xl = sx(r.lime);
          const shapColor = r.shap >= 0 ? RAISES : LOWERS;
          const limeColor = r.lime >= 0 ? RAISES : LOWERS;
          return (
            <g key={r.feature} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={0}
                y={i * ROW + 1}
                width={width}
                height={ROW - 2}
                rx={6}
                fill={hover === i ? "rgb(255 255 255 / 0.04)" : "transparent"}
              />
              <text x={0} y={y - 3} fontSize={11.5} fill="var(--color-ink)">
                {r.label.length > 23 ? `${r.label.slice(0, 22)}…` : r.label}
              </text>
              <text x={0} y={y + 10} fontSize={10} fill="var(--color-ink-3)">
                {r.display}
              </text>
              <motion.line
                y1={y}
                y2={y}
                stroke="var(--color-ink-3)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.45}
                initial={{ x1: sx(0), x2: sx(0) }}
                animate={{ x1: Math.min(xs, xl), x2: Math.max(xs, xl) }}
                transition={{ ...SPRING, delay: 0.04 * i }}
              />
              <motion.circle
                cy={y}
                r={R + 0.5}
                fill="var(--color-surface)"
                stroke={limeColor}
                strokeWidth={2}
                initial={{ cx: sx(0), opacity: 0 }}
                animate={{ cx: xl, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.06 + 0.04 * i }}
              />
              <motion.circle
                cy={y}
                r={R}
                fill={shapColor}
                stroke="var(--color-surface)"
                strokeWidth={2}
                initial={{ cx: sx(0), opacity: 0 }}
                animate={{ cx: xs, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.04 * i }}
                style={{ filter: `drop-shadow(0 0 5px ${withAlpha(shapColor, 0.6)})` }}
              />
            </g>
          );
        })}
      </svg>
      <AnimatePresence>
        {hover != null && rows[hover] && (
          <motion.div
            key={rows[hover].feature}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line-strong bg-[#0b111bf2] px-3 py-2 shadow-xl"
            style={{ left: Math.min(width - 230, LABEL_W), top: Math.max(0, hover * ROW - 62) }}
          >
            <p className="text-xs font-semibold text-ink">
              {rows[hover].label}: {rows[hover].display}
            </p>
            <p className="tabular mt-1 text-[11px] text-ink-2">
              SHAP {signed(rows[hover].shap, 2)} · LIME {signed(rows[hover].lime, 2)} log-odds
            </p>
            <p className="tabular text-[11px] text-ink-3">
              Difference {Math.abs(rows[hover].shap - rows[hover].lime).toFixed(2)} log-odds
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** LIME as a second, independent explanation of the same prediction, compared with SHAP. */
export function LimeComparison({ target }: { target: TargetId }) {
  const patient = useStore((s) => s.patient);
  const key = useMemo(() => JSON.stringify(patient), [patient]);
  const [result, setResult] = useState<LimeResult | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(380);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setResult(hit);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .lime(patient, ctrl.signal)
        .then((r) => {
          cache.set(key, r);
          if (cache.size > 40) cache.delete(cache.keys().next().value as string);
          setResult(r);
          setError(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
    // `patient` is captured through `key` (its JSON), so identical inputs reuse the result.
  }, [key]);

  const t = result?.targets[target];
  const { rows, max } = useMemo(() => {
    if (!t) return { rows: [] as LimeWeight[], max: 1 };
    const rows = [...t.weights]
      .sort((a, b) => Math.max(Math.abs(b.shap), Math.abs(b.lime)) - Math.max(Math.abs(a.shap), Math.abs(a.lime)))
      .slice(0, TOP);
    const peak = Math.max(0.1, ...rows.flatMap((r) => [Math.abs(r.shap), Math.abs(r.lime)]));
    // A round axis limit: 0.5, 1, 1.5, 2, ...
    return { rows, max: Math.ceil((peak * 1.08) / 0.5) * 0.5 };
  }, [t]);

  if (error && !result) {
    return <p className="mt-3 text-xs text-ink-3">LIME is unavailable: {error}</p>;
  }

  const v = t ? verdict(t) : null;
  return (
    <div ref={wrap} className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {v ? (
            <motion.span
              key={`${target}-${v.label}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="chip text-ink-2"
              style={{ borderColor: withAlpha(v.color, 0.45), background: withAlpha(v.color, 0.12) }}
            >
              <v.icon size={12} color={v.color} strokeWidth={2.4} aria-hidden /> {v.label}
            </motion.span>
          ) : (
            <span className="skeleton h-6 w-36 rounded-full" />
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-accent" aria-label="Computing LIME" />}
          <Segmented
            size="xs"
            ariaLabel="LIME view"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </div>

      {t ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Stat
              label="Correlation"
              value={t.correlation}
              format={(x) => x.toFixed(2)}
              hint="Pearson correlation between the LIME weights and the SHAP values of all factors"
            />
            <Stat
              label={`Top ${t.top_n} shared`}
              value={t.top_overlap}
              format={(x) => `${Math.round(x)} of ${t.top_n}`}
              hint={`How many of the ${t.top_n} largest factors are the same in both methods`}
            />
            <Stat
              label="Same direction"
              value={t.sign_agreement}
              format={rate}
              hint="Share of the main SHAP factors whose LIME weight points the same way"
            />
            <Stat
              label="LIME fit R²"
              value={t.r2}
              format={(x) => x.toFixed(2)}
              hint="How well the local linear surrogate reproduces the model on the perturbed samples"
            />
          </div>

          {view === "chart" ? (
            <div className="mt-3">
              <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-2" /> SHAP (exact, additive)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-2" /> LIME (local linear surrogate)
                </span>
              </div>
              <Dumbbell rows={rows} max={max} width={width} />
              <p className="-mt-1 text-center text-[10.5px] text-ink-3">← lowers risk · contribution in log-odds · raises risk →</p>
            </div>
          ) : (
            <div className="mt-3">
              <DataTable
                head={["Feature", "Value", "SHAP", "LIME"]}
                rows={[...t.weights]
                  .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
                  .map((w) => [w.label, w.display + (w.imputed ? " (imputed)" : ""), signed(w.shap, 3), signed(w.lime, 3)])}
              />
            </div>
          )}

          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
            <Info size={12} className="mt-px shrink-0" aria-hidden />
            LIME fits a weighted linear model to {result!.samples.toLocaleString("en")} perturbed versions of this patient, in
            which random factors take the values of real development patients ({result!.donors} per sample). It is computed
            independently of SHAP, so close agreement means the explanation does not depend on the method.
          </p>
        </>
      ) : (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
          <div className="skeleton h-64 rounded-lg" />
        </div>
      )}
    </div>
  );
}
