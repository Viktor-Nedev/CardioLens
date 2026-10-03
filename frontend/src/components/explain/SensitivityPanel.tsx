import { Info, Loader2, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { api } from "../../lib/api";
import { CONTEXT, SERIES, riskColor } from "../../lib/colors";
import { pct } from "../../lib/format";
import { TARGET_ORDER, type Profile, type TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { Section, Segmented } from "../ui/primitives";

const M = { top: 12, right: 14, bottom: 34, left: 40 };
const HEIGHT = 230;

function fmtValue(p: Profile, v: number | string): string {
  if (p.labels) {
    const i = p.grid.findIndex((g) => String(g) === String(v));
    return i >= 0 ? p.labels[i] : String(v);
  }
  const n = Number(v);
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
  return p.unit ? `${s} ${p.unit}` : s;
}

/** Individual conditional expectation curve: one input varies, every other input stays as entered. */
function ProfileChart({ profile, target }: { profile: Profile; target: TargetId }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const discrete = profile.labels != null;
  const n = profile.grid.length;
  const w = width - M.left - M.right;
  const h = HEIGHT - M.top - M.bottom;
  const numericGrid = profile.grid.map(Number);
  const x0 = discrete ? 0 : numericGrid[0];
  const x1 = discrete ? n - 1 : numericGrid[n - 1];
  const sxIndex = (i: number) => {
    if (discrete) return M.left + (n === 1 ? w / 2 : (i / (n - 1)) * w * 0.8 + w * 0.1);
    return M.left + ((numericGrid[i] - x0) / (x1 - x0 || 1)) * w;
  };
  const sxValue = (v: number) => (discrete ? M.left : M.left + ((v - x0) / (x1 - x0 || 1)) * w);
  const sy = (p: number) => M.top + (1 - p) * h;

  const currentIndex = useMemo(() => {
    if (discrete) return Math.max(0, profile.grid.findIndex((g) => String(g) === String(profile.current)));
    const c = Number(profile.current);
    let best = 0;
    numericGrid.forEach((g, i) => {
      if (Math.abs(g - c) < Math.abs(numericGrid[best] - c)) best = i;
    });
    return best;
  }, [profile, discrete, numericGrid]);

  const curve = profile.targets[target];
  const currentP = discrete
    ? curve[currentIndex]
    : (() => {
        const c = Number(profile.current);
        const i = Math.max(1, numericGrid.findIndex((g) => g >= c));
        const [ga, gb] = [numericGrid[i - 1], numericGrid[i]];
        const t = gb === ga ? 0 : (c - ga) / (gb - ga);
        return curve[i - 1] + (curve[i] - curve[i - 1]) * Math.min(1, Math.max(0, t));
      })();
  const currentX = discrete ? sxIndex(currentIndex) : sxValue(Number(profile.current));

  const path = (vals: number[]) => vals.map((p, i) => `${i ? "L" : "M"}${sxIndex(i).toFixed(1)},${sy(p).toFixed(1)}`).join("");
  const area = `${path(curve)}L${sxIndex(n - 1).toFixed(1)},${sy(0)}L${sxIndex(0).toFixed(1)},${sy(0)}Z`;
  const threshold = profile.thresholds[target];
  const ref = profile.ref && !discrete ? [Math.max(x0, profile.ref[0]), Math.min(x1, profile.ref[1])] : null;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + M.left;
    let best = 0;
    for (let i = 0; i < n; i++) if (Math.abs(sxIndex(i) - px) < Math.abs(sxIndex(best) - px)) best = i;
    setHover(best);
  };

  const xTicks = discrete
    ? profile.grid.map((_, i) => i)
    : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((n - 1) * f));
  const animKey = `${profile.feature}-${target}`;

  return (
    <div ref={wrap} className="relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label={`Predicted ${target.toUpperCase()} probability as ${profile.label} varies`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + w} y1={sy(t)} y2={sy(t)} stroke="var(--color-grid)" />
            <text x={M.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--color-ink-3)">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {ref && ref[1] > ref[0] && (
          <g>
            <rect x={sxValue(ref[0])} y={M.top} width={sxValue(ref[1]) - sxValue(ref[0])} height={h} fill="rgb(25 158 112 / 0.08)" />
            <text x={sxValue(ref[0]) + 4} y={M.top + 11} fontSize={9.5} fill="var(--color-ink-3)">
              reference range
            </text>
          </g>
        )}
        <line x1={M.left} x2={M.left + w} y1={sy(threshold)} y2={sy(threshold)} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1} />
        <text x={M.left + w} y={sy(threshold) - 4} textAnchor="end" fontSize={9.5} fill="var(--color-ink-3)">
          decision threshold {pct(threshold)}
        </text>

        {/* other targets as context */}
        {TARGET_ORDER.filter((t) => t !== target).map((t) =>
          discrete ? (
            profile.targets[t].map((p, i) => <circle key={`${t}${i}`} cx={sxIndex(i)} cy={sy(p)} r={3} fill={CONTEXT} opacity={0.7} />)
          ) : (
            <path key={t} d={path(profile.targets[t])} fill="none" stroke={CONTEXT} strokeWidth={1.25} opacity={0.65} />
          ),
        )}

        {!discrete && (
          <motion.path
            key={`area-${animKey}`}
            d={area}
            fill={SERIES}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.path
          key={`line-${animKey}`}
          d={path(curve)}
          fill="none"
          stroke={SERIES}
          strokeWidth={2.2}
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
        {discrete &&
          curve.map((p, i) => (
            <circle key={`d${i}`} cx={sxIndex(i)} cy={sy(p)} r={4.5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
          ))}

        {/* current value */}
        <line x1={currentX} x2={currentX} y1={M.top} y2={M.top + h} stroke="rgb(255 255 255 / 0.45)" strokeWidth={1} />
        <motion.circle
          cx={currentX}
          cy={sy(currentP)}
          r={6}
          fill={riskColor(currentP)}
          stroke="white"
          strokeWidth={2}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{ transformOrigin: `${currentX}px ${sy(currentP)}px`, filter: `drop-shadow(0 0 6px ${riskColor(currentP)})` }}
        />

        {xTicks.map((i) => (
          <text key={`x${i}`} x={sxIndex(i)} y={M.top + h + 16} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
            {discrete ? profile.labels![i] : fmtValue(profile, profile.grid[i])}
          </text>
        ))}
        <line x1={M.left} x2={M.left + w} y1={M.top + h} y2={M.top + h} stroke="var(--color-axis)" />

        {hover != null && (
          <g pointerEvents="none">
            <line x1={sxIndex(hover)} x2={sxIndex(hover)} y1={M.top} y2={M.top + h} stroke="var(--color-ink-3)" />
            <circle cx={sxIndex(hover)} cy={sy(curve[hover])} r={4.5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}
        <rect x={M.left} y={M.top} width={w} height={h} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 shadow-xl"
          style={{ left: Math.min(sxIndex(hover) + 12, width - 170), top: 8 }}
        >
          <p className="tabular mb-1 text-[10px] text-ink-3">
            {profile.label}: {fmtValue(profile, profile.grid[hover])}
          </p>
          {TARGET_ORDER.map((t) => (
            <p key={t} className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: t === target ? SERIES : CONTEXT }} />
              <span className="tabular font-semibold text-ink">{pct(profile.targets[t][hover])}</span>
              <span className="text-ink-3">{t.toUpperCase()}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** "What if this factor were different?": model sensitivity for the current patient. */
export function SensitivityPanel() {
  const prediction = useStore((s) => s.prediction);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const patient = useStore((s) => s.patient);
  const schema = useStore((s) => s.schema);
  const [feature, setFeature] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const kindOf = useMemo(() => Object.fromEntries((schema?.features ?? []).map((f) => [f.id, f.kind])), [schema]);
  const labelOf = useMemo(() => Object.fromEntries((schema?.features ?? []).map((f) => [f.id, f.label])), [schema]);
  const candidates = useMemo(
    () =>
      (prediction?.targets[selected]?.contributions ?? [])
        .filter((c) => kindOf[c.feature] && kindOf[c.feature] !== "categorical")
        .slice(0, 4)
        .map((c) => c.feature),
    [prediction, selected, kindOf],
  );
  const active = feature ?? candidates[0] ?? null;

  useEffect(() => {
    if (!active || Object.keys(patient).length === 0) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      api
        .profile(patient, active, ctrl.signal)
        .then((p) => setProfile(p))
        .catch(() => undefined)
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [patient, active]);

  if (!prediction || !schema) return <div className="panel skeleton h-96" aria-busy="true" />;

  return (
    <Section
      title="What if one factor changes?"
      icon={SlidersHorizontal}
      right={
        <Segmented
          size="xs"
          ariaLabel="Target"
          value={selected}
          onChange={(t: TargetId) => select(t)}
          options={TARGET_ORDER.map((t) => ({ value: t, label: prediction.targets[t].short }))}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {candidates.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFeature(f)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              f === active ? "border-accent/60 bg-accent-soft text-ink" : "border-line text-ink-3 hover:text-ink"
            }`}
          >
            {labelOf[f]}
          </button>
        ))}
        <select
          value={active ?? ""}
          onChange={(e) => setFeature(e.target.value)}
          className="ml-auto max-w-40 cursor-pointer rounded-lg border border-line bg-black/30 px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none"
          aria-label="Choose any factor"
        >
          {schema.groups.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {schema.features
                .filter((f) => f.group === g.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="relative mt-3 min-h-[230px]">
        {profile && profile.feature === active ? (
          <ProfileChart profile={profile} target={selected} />
        ) : (
          <div className="skeleton h-[230px] rounded-lg" />
        )}
        {loading && (
          <Loader2 size={14} className="absolute right-1 top-1 animate-spin text-accent" aria-label="Updating" />
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: SERIES }} />
          {prediction.targets[selected].short} (selected)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: CONTEXT }} />
          Other targets
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: riskColor(prediction.targets[selected].probability) }} />
          This patient
        </span>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
        <Info size={12} className="mt-px shrink-0" aria-hidden />
        Model sensitivity for this patient: only the chosen factor varies, every other input stays as entered. It shows how
        the model responds, not what a treatment would achieve.
      </p>
    </Section>
  );
}
