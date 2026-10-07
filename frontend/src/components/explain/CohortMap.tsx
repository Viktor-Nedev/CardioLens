import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { riskColor } from "../../lib/colors";
import type { CohortMap as MapData, MapPoint, SimilarResult } from "../../lib/types";

const H = 236;
const PAD = 14;
const SPRING = { type: "spring", stiffness: 110, damping: 18 } as const;
const VESSEL_LABEL = ["Normal coronaries", "1-vessel disease", "2-vessel disease", "3-vessel disease"];

// The map never changes while the app runs: fetch it once.
let mapRequest: Promise<MapData> | null = null;
const loadMap = () => (mapRequest ??= api.cohortMap().catch((e) => ((mapRequest = null), Promise.reject(e))));

const colorOf = (vessels: number) => riskColor(Math.min(3, vessels) / 3);

/**
 * The development cohort as a t-SNE map: patients with similar inputs sit together. The current
 * patient's marker glides to its interpolated position as inputs change, linked to its neighbours.
 */
export function CohortMap({ result, risk }: { result: SimilarResult; risk: number }) {
  const [data, setData] = useState<MapData | null>(null);
  const [hover, setHover] = useState<MapPoint | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(380);
  // The left-to-right entrance stagger applies to the first appearance only.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMap()
      .then((d) => {
        if (!alive) return;
        setData(d);
        window.setTimeout(() => alive && setEntered(true), d.points.length * 3 + 600);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sx = (x: number) => PAD + x * (width - 2 * PAD);
  const sy = (y: number) => PAD + (1 - y) * (H - 2 * PAD);
  const neighbourIds = useMemo(() => new Set(result.neighbours.map((n) => n.patient_id)), [result]);
  const byId = useMemo(() => new Map((data?.points ?? []).map((p) => [p.patient_id, p])), [data]);
  // Stagger the entrance from left to right.
  const order = useMemo(() => {
    const ranked = [...(data?.points ?? [])].sort((a, b) => a.x - b.x);
    return new Map(ranked.map((p, i) => [p.patient_id, i]));
  }, [data]);

  const pos = result.position;
  const px = pos ? sx(pos[0]) : width / 2;
  const py = pos ? sy(pos[1]) : H / 2;

  return (
    <div ref={wrap} className="relative mt-3 overflow-hidden rounded-xl border border-line bg-black/25">
      {!data ? (
        <div className="skeleton" style={{ height: H }} aria-busy="true" />
      ) : (
        <svg width={width} height={H} role="img" aria-label="Map of the development cohort with this patient's position">
          <defs>
            <radialGradient id="map-glow">
              <stop offset="0%" stopColor={riskColor(risk)} stopOpacity={0.45} />
              <stop offset="100%" stopColor={riskColor(risk)} stopOpacity={0} />
            </radialGradient>
          </defs>
          {data.points.map((p) => {
            const near = neighbourIds.has(p.patient_id);
            const delay = entered ? 0 : (order.get(p.patient_id) ?? 0) * 0.003;
            return (
              <motion.circle
                key={p.patient_id}
                cx={sx(p.x)}
                cy={sy(p.y)}
                fill={colorOf(p.vessels)}
                stroke={near ? "#ffffff" : "transparent"}
                strokeWidth={1.5}
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: near ? 5 : 3, opacity: near ? 1 : hover && hover !== p ? 0.45 : 0.7 }}
                transition={{ r: { ...SPRING, delay }, opacity: { duration: 0.3, delay } }}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default" }}
              />
            );
          })}

          {/* Links from the patient to its nearest neighbours */}
          {pos &&
            result.neighbours.map((n, i) => {
              const p = byId.get(n.patient_id);
              if (!p) return null;
              return (
                <motion.line
                  key={n.patient_id}
                  stroke="#ffffff"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  initial={{ x1: px, y1: py, x2: px, y2: py }}
                  animate={{ x1: px, y1: py, x2: sx(p.x), y2: sy(p.y) }}
                  transition={{ ...SPRING, delay: 0.05 * i }}
                  pointerEvents="none"
                />
              );
            })}

          {/* The patient: a soft glow, a pulsing ring and the marker itself */}
          {pos && (
            <motion.g initial={false} animate={{ x: px, y: py }} transition={SPRING} pointerEvents="none">
              <circle r={26} fill="url(#map-glow)" />
              <motion.circle
                r={7}
                fill="none"
                stroke={riskColor(risk)}
                strokeWidth={2}
                animate={{ r: [7, 20], opacity: [0.8, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              <circle r={7} fill={riskColor(risk)} stroke="#ffffff" strokeWidth={2} />
              <text y={-13} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff" style={{ paintOrder: "stroke" }} stroke="#070b12" strokeWidth={3}>
                This patient
              </text>
            </motion.g>
          )}
        </svg>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-[#0b111bf2] px-2.5 py-1.5 text-[11px] shadow-xl"
          style={{ left: Math.min(sx(hover.x) + 10, width - 190), top: Math.max(4, sy(hover.y) - 46) }}
        >
          <p className="font-semibold text-ink">Development patient #{hover.patient_id}</p>
          <p className="text-ink-3">
            Angiography: {VESSEL_LABEL[Math.min(3, hover.vessels)]}
            {neighbourIds.has(hover.patient_id) ? " · a nearest neighbour" : ""}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-ink-2">
        {VESSEL_LABEL.map((label, v) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorOf(v) }} />
            {v === 0 ? "Normal" : `${v}-vessel`}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-white" /> Nearest {result.k}
        </span>
      </div>
    </div>
  );
}
