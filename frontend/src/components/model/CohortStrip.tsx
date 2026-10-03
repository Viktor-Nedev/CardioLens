import { ArrowDown, ArrowUp, MoveHorizontal, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { pct } from "../../lib/format";
import { confusionAt, type Confusion } from "../../lib/metrics";
import type { Case, TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnimatedNumber, ChartCard, DataTable, LegendKey } from "../ui/primitives";

const M = { top: 30, right: 16, bottom: 30, left: 92 };
const ROW_H = 92;
const R = 4.5;
const CORRECT = "#3987e5";
const WRONG = "#fab219";

interface Dot {
  c: Case;
  x: number;
  y: number;
}

/** Beeswarm placement: dots keep their x and stack outwards from the row centre to avoid overlap. */
function swarm(xs: { c: Case; x: number }[], centre: number): Dot[] {
  const placed: Dot[] = [];
  const limit = ROW_H / 2 - R - 2; // stay inside the row; very dense clusters may overlap slightly
  const sorted = [...xs].sort((a, b) => a.x - b.x);
  for (const d of sorted) {
    let offset = 0;
    for (let k = 0; k < 40; k++) {
      const candidate = k === 0 ? 0 : Math.ceil(k / 2) * (R * 2 + 1) * (k % 2 ? -1 : 1);
      if (Math.abs(candidate) > limit) break;
      offset = candidate;
      if (!placed.some((p) => Math.hypot(p.x - d.x, p.y - (centre + offset)) < R * 2 + 1)) break;
    }
    placed.push({ ...d, y: centre + offset });
  }
  return placed;
}

function Rate({
  label,
  value,
  base,
  detail,
}: {
  label: string;
  value: number | null;
  base: number | null;
  detail: string;
}) {
  const delta = value != null && base != null ? Math.round((value - base) * 100) : 0;
  return (
    <div className="rounded-lg border border-line bg-black/20 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        {value == null ? (
          <span className="text-base font-semibold text-ink-3">n/a</span>
        ) : (
          <AnimatedNumber value={value} format={(v) => `${Math.round(v * 100)}%`} className="tabular text-base font-semibold text-ink" />
        )}
        <AnimatePresence>
          {delta !== 0 && (
            <motion.span
              key={delta > 0 ? "up" : "down"}
              initial={{ opacity: 0, y: delta > 0 ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="tabular inline-flex items-center text-[10.5px] text-ink-2"
              title="Change against the model's threshold"
            >
              {delta > 0 ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden />}
              {Math.abs(delta)} pp
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="tabular truncate text-[10.5px] text-ink-3">{detail}</p>
    </div>
  );
}

function RatesRow({ c, base, noun }: { c: Confusion; base: Confusion; noun: string }) {
  const n = c.tp + c.fp + c.tn + c.fn;
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      <Rate label="Sensitivity" value={c.sensitivity} base={base.sensitivity} detail={`${c.tp} of ${c.tp + c.fn} ${noun} flagged`} />
      <Rate label="Specificity" value={c.specificity} base={base.specificity} detail={`${c.tn} of ${c.tn + c.fp} normal cleared`} />
      <Rate label="PPV" value={c.ppv} base={base.ppv} detail={`${c.tp} of ${c.tp + c.fp} positive calls right`} />
      <Rate label="NPV" value={c.npv} base={base.npv} detail={`${c.tn} of ${c.tn + c.fn} negative calls right`} />
      <Rate label="Accuracy" value={c.accuracy} base={base.accuracy} detail={`${c.tp + c.tn} of ${n} correct`} />
      <Rate label="F1-score" value={c.f1} base={base.f1} detail="Balance of PPV and sensitivity" />
    </div>
  );
}

/**
 * Every hold-out patient on one probability axis, split by angiography result, with a
 * draggable decision threshold: the calls and the clinical rates update as it moves.
 */
export function CohortStrip({ target }: { target: TargetId }) {
  const cases = useStore((s) => s.cases);
  const modelThreshold = useStore((s) => s.metrics?.targets[target].threshold ?? 0.5);
  const short = useStore((s) => s.metrics?.targets[target].short ?? target.toUpperCase());
  const loadPatient = useStore((s) => s.loadPatient);
  const setTab = useStore((s) => s.setTab);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<Dot | null>(null);
  const [cut, setCut] = useState(modelThreshold);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setCut(modelThreshold), [target, modelThreshold]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(420, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width - M.left - M.right;
  const sx = (p: number) => M.left + p * w;
  const positiveLabel = target === "cad" ? "CAD" : "Stenotic";
  const rows = [
    { label: positiveLabel, truth: 1, centre: M.top + ROW_H / 2 },
    { label: "Normal", truth: 0, centre: M.top + ROW_H + ROW_H / 2 },
  ];
  const height = M.top + ROW_H * 2 + M.bottom;
  const plotBottom = M.top + ROW_H * 2;

  const dots = useMemo(
    () =>
      rows.flatMap((row) =>
        swarm(
          cases.filter((c) => c.truth[target] === row.truth).map((c) => ({ c, x: sx(c.predicted[target]) })),
          row.centre,
        ),
      ),
    // `rows` and `sx` are derived from the target and the width.
    [cases, target, w],
  );

  const y = useMemo(() => cases.map((c) => c.truth[target]), [cases, target]);
  const p = useMemo(() => cases.map((c) => c.predicted[target]), [cases, target]);
  const conf = useMemo(() => confusionAt(y, p, cut), [y, p, cut]);
  const base = useMemo(() => confusionAt(y, p, modelThreshold), [y, p, modelThreshold]);
  const isCorrect = (c: Case) => c.predicted[target] >= cut === (c.truth[target] === 1);
  const wrong = conf.fp + conf.fn;
  const atModel = Math.abs(cut - modelThreshold) < 0.0005;

  const toP = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return cut;
    return Math.min(0.99, Math.max(0.01, Math.round(((clientX - r.left - M.left) / w) * 200) / 200));
  };
  const onDown = (e: PointerEvent<SVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setHover(null);
    setCut(toP(e.clientX));
  };
  const onMove = (e: PointerEvent<SVGElement>) => dragging && setCut(toP(e.clientX));
  const onUp = (e: PointerEvent<SVGElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const open = (c: Case) => {
    loadPatient(c.features, c.title, c.id);
    setTab("analysis");
  };

  return (
    <ChartCard
      title={`Hold-out patients · ${short}`}
      subtitle={`Each dot is one of the ${cases.length} unseen patients, placed by predicted probability. Drag the threshold to trade missed disease against false alarms; ${wrong} patients fall on the wrong side at ${pct(cut)}. Click a dot to open that patient.`}
      legend={
        <>
          <LegendKey kind="dot" color={CORRECT} label="Classified correctly" />
          <LegendKey kind="dot" color={WRONG} label="Misclassified" />
          <LegendKey color="#ffffff" label="Decision threshold (drag)" />
        </>
      }
      table={
        <DataTable
          head={["Patient", "Predicted", "Angiography", `Call at ${pct(cut)}`]}
          rows={[...cases]
            .sort((a, b) => b.predicted[target] - a.predicted[target])
            .map((c) => [
              `#${c.patient_id} · ${c.subtitle}`,
              pct(c.predicted[target]),
              c.truth[target] ? "positive" : "negative",
              isCorrect(c) ? "correct" : "misclassified",
            ])}
        />
      }
    >
      <div ref={wrap} className="relative w-full">
        <svg
          ref={svg}
          width={width}
          height={height}
          role="img"
          aria-label={`Hold-out patients by predicted ${short} probability, threshold ${pct(cut)}`}
          className={dragging ? "cursor-ew-resize select-none" : undefined}
        >
          {/* Called-negative and called-positive zones */}
          <motion.rect
            y={M.top}
            height={ROW_H * 2}
            fill="rgb(25 158 112 / 0.05)"
            initial={false}
            animate={{ x: M.left, width: Math.max(0, sx(cut) - M.left) }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
          <motion.rect
            y={M.top}
            height={ROW_H * 2}
            fill="rgb(208 59 59 / 0.07)"
            initial={false}
            animate={{ x: sx(cut), width: Math.max(0, M.left + w - sx(cut)) }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
          <text x={M.left + 6} y={plotBottom - 7} fontSize={9.5} fill="var(--color-ink-3)" className="uppercase">
            called normal
          </text>
          <text x={M.left + w - 6} y={plotBottom - 7} fontSize={9.5} textAnchor="end" fill="var(--color-ink-3)" className="uppercase">
            called {positiveLabel.toLowerCase()}
          </text>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={M.top} y2={plotBottom} stroke="var(--color-grid)" />
              <text x={sx(t)} y={height - 10} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          <text x={12} y={M.top - 6} fontSize={9.5} fill="var(--color-ink-3)" className="uppercase">
            Angiography
          </text>
          {rows.map((r) => (
            <g key={r.truth}>
              <line x1={M.left} x2={M.left + w} y1={r.centre} y2={r.centre} stroke="var(--color-axis)" opacity={0.5} />
              <text x={M.left - 14} y={r.centre} dy="0.32em" textAnchor="end" fontSize={11.5} fontWeight={600} fill="var(--color-ink-2)">
                {r.label}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={M.left + w} y1={M.top + ROW_H} y2={M.top + ROW_H} stroke="var(--color-grid)" />

          {/* The model's own threshold stays visible once the user moves away from it */}
          {!atModel && (
            <g pointerEvents="none">
              <line
                x1={sx(modelThreshold)}
                x2={sx(modelThreshold)}
                y1={M.top}
                y2={plotBottom}
                stroke="white"
                strokeDasharray="3 4"
                opacity={0.4}
              />
              <text x={sx(modelThreshold) + 4} y={M.top + 11} fontSize={9} fill="var(--color-ink-3)">
                model {pct(modelThreshold)}
              </text>
            </g>
          )}

          {dots.map((d, i) => (
            <motion.circle
              key={`${target}-${d.c.id}`}
              r={R}
              stroke="var(--color-surface)"
              strokeWidth={2}
              initial={{ cx: M.left, cy: d.y, opacity: 0, fill: isCorrect(d.c) ? CORRECT : WRONG }}
              animate={{ cx: d.x, cy: d.y, opacity: 1, fill: isCorrect(d.c) ? CORRECT : WRONG }}
              transition={{
                cx: { type: "spring", stiffness: 90, damping: 16, delay: 0.004 * i },
                opacity: { duration: 0.4, delay: 0.004 * i },
                fill: { duration: 0.25 },
              }}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => !dragging && setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => open(d.c)}
            >
              <title>{`#${d.c.patient_id} · ${pct(d.c.predicted[target])}`}</title>
            </motion.circle>
          ))}
          {hover && (
            <circle cx={hover.x} cy={hover.y} r={R + 4} fill="none" stroke="white" strokeWidth={1.5} pointerEvents="none" />
          )}

          {/* Draggable threshold: a wide invisible grip around the line, plus a knob on top */}
          <g
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ cursor: "ew-resize", touchAction: "none" }}
          >
            <motion.rect
              y={M.top - 22}
              width={18}
              height={ROW_H * 2 + 24}
              fill="transparent"
              initial={false}
              animate={{ x: sx(cut) - 9 }}
              transition={{ type: "spring", stiffness: 700, damping: 45 }}
            />
            <motion.line
              y1={M.top - 10}
              y2={plotBottom + 2}
              stroke="white"
              strokeWidth={dragging ? 2.5 : 1.75}
              initial={false}
              animate={{ x1: sx(cut), x2: sx(cut) }}
              transition={{ type: "spring", stiffness: 700, damping: 45 }}
              style={{ filter: "drop-shadow(0 0 6px rgb(255 255 255 / 0.55))" }}
            />
            <motion.circle
              cy={M.top - 12}
              r={dragging ? 7.5 : 6}
              fill="var(--color-surface)"
              stroke="white"
              strokeWidth={2}
              initial={false}
              animate={{ cx: sx(cut) }}
              transition={{ type: "spring", stiffness: 700, damping: 45 }}
            />
            <motion.text
              y={M.top - 8.5}
              fontSize={10.5}
              fontWeight={700}
              fill="var(--color-ink)"
              textAnchor={cut > 0.9 ? "end" : "start"}
              initial={false}
              animate={{ x: cut > 0.9 ? sx(cut) - 12 : sx(cut) + 12 }}
              transition={{ type: "spring", stiffness: 700, damping: 45 }}
              pointerEvents="none"
            >
              {pct(cut)}
            </motion.text>
          </g>
        </svg>

        {hover && !dragging && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl"
            style={{ left: Math.min(hover.x + 12, width - 236), top: Math.max(0, hover.y - 64) }}
          >
            <p className="tabular text-sm font-semibold text-ink">{pct(hover.c.predicted[target])}</p>
            <p className="text-[11px] text-ink-2">
              #{hover.c.patient_id} · {hover.c.subtitle}
            </p>
            <p className="text-[11px] text-ink-3">
              Angiography: {hover.c.truth[target] ? "positive" : "negative"} ·{" "}
              {isCorrect(hover.c) ? "correct" : "misclassified"} at {pct(cut)} · click to open
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex min-w-56 flex-1 items-center gap-3 text-[11px] text-ink-3">
          <MoveHorizontal size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="shrink-0">Decision threshold</span>
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.005}
            value={cut}
            onChange={(e) => setCut(Number(e.target.value))}
            className="min-w-0 flex-1"
            aria-label={`Decision threshold for ${short}`}
          />
          <span className="tabular w-9 shrink-0 text-right font-semibold text-ink">{pct(cut)}</span>
        </label>
        <AnimatePresence initial={false} mode="wait">
          {atModel ? (
            <motion.span
              key="model"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-ink-3"
            >
              The model's threshold: Youden's J on development out-of-fold predictions
            </motion.span>
          ) : (
            <motion.button
              key="reset"
              type="button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCut(modelThreshold)}
              className="btn border-accent/40 text-ink"
            >
              <RotateCcw size={13} /> Model threshold ({pct(modelThreshold)})
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <RatesRow c={conf} base={base} noun={target === "cad" ? "with CAD" : "stenotic"} />
    </ChartCard>
  );
}
