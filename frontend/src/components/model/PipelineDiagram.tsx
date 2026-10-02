import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "../ui/primitives";

interface Node {
  id: string;
  x: number;
  y: number;
  title: string;
  sub: string;
  tone?: "accent" | "warn";
}

const W = 140;
const H = 56;

const NODES: Node[] = [
  { id: "data", x: 10, y: 30, title: "UCI dataset", sub: "303 patients · 54 inputs" },
  { id: "guard", x: 180, y: 30, title: "Leakage guard", sub: "no Cath · LAD · LCX · RCA" },
  { id: "split", x: 350, y: 30, title: "Stratified split", sub: "242 dev · 61 hold-out" },
  { id: "cv", x: 520, y: 30, title: "Nested CV 5×5", sub: "4 model families" },
  { id: "select", x: 690, y: 30, title: "Select & tune", sub: "best AUC, simplest on ties" },
  { id: "calib", x: 860, y: 30, title: "Calibrate", sub: "Platt · Youden threshold" },
  { id: "deploy", x: 1030, y: 30, title: "Deployed models", sub: "CAD · LAD · LCX · RCA", tone: "accent" },
  { id: "holdout", x: 350, y: 150, title: "Hold-out set", sub: "61 patients, used once", tone: "warn" },
  { id: "eval", x: 1030, y: 150, title: "Evaluation", sub: "bootstrap 95% CIs", tone: "accent" },
];

const cx = (n: Node) => n.x + W / 2;
const cy = (n: Node) => n.y + H / 2;
const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, Node>;

function horizontal(a: string, b: string): string {
  const A = byId[a];
  const B = byId[b];
  return `M ${A.x + W} ${cy(A)} L ${B.x - 6} ${cy(B)}`;
}
function vertical(a: string, b: string): string {
  const A = byId[a];
  const B = byId[b];
  return `M ${cx(A)} ${A.y + H} L ${cx(B)} ${B.y - 6}`;
}

const EDGES: { id: string; d: string; particles: number; label?: string }[] = [
  { id: "e1", d: horizontal("data", "guard"), particles: 1 },
  { id: "e2", d: horizontal("guard", "split"), particles: 1 },
  { id: "e3", d: horizontal("split", "cv"), particles: 1 },
  { id: "e4", d: horizontal("cv", "select"), particles: 1 },
  { id: "e5", d: horizontal("select", "calib"), particles: 1 },
  { id: "e6", d: horizontal("calib", "deploy"), particles: 1 },
  { id: "e7", d: vertical("split", "holdout"), particles: 1 },
  {
    id: "e8",
    d: horizontal("holdout", "eval"),
    particles: 3,
    label: "kept aside: never used for training, selection, calibration or thresholds",
  },
  { id: "e9", d: vertical("deploy", "eval"), particles: 1 },
];

/** Animated overview of the validation protocol: data flows left to right, the hold-out set bypasses everything. */
export function PipelineDiagram() {
  const reduced = useReducedMotion();
  return (
    <div className="scroll-slim overflow-x-auto">
      <svg viewBox="0 0 1180 220" className="min-w-[900px]" role="img" aria-label="Model building and validation pipeline">
        <defs>
          <marker id="pipe-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="#3a4a60" />
          </marker>
          <radialGradient id="pipe-dot">
            <stop offset="0%" stopColor="#d8f4ff" />
            <stop offset="100%" stopColor="#5cc8f5" stopOpacity="0" />
          </radialGradient>
        </defs>

        {EDGES.map((e, i) => (
          <g key={e.id}>
            <motion.path
              d={e.d}
              fill="none"
              stroke="#3a4a60"
              strokeWidth={1.5}
              markerEnd="url(#pipe-arrow)"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease: EASE_OUT }}
            />
            {e.label && (
              <text x={(byId.holdout.x + W + byId.eval.x) / 2} y={cy(byId.holdout) - 10} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-3)">
                {e.label}
              </text>
            )}
            {!reduced &&
              Array.from({ length: e.particles }, (_, k) => (
                <circle key={k} r={4} fill="url(#pipe-dot)">
                  <animateMotion
                    dur={`${e.particles > 1 ? 4.5 : 1.8}s`}
                    repeatCount="indefinite"
                    begin={`${-(k * (e.particles > 1 ? 1.5 : 0)) - i * 0.35}s`}
                    path={e.d}
                  />
                </circle>
              ))}
          </g>
        ))}

        {NODES.map((n, i) => {
          const stroke = n.tone === "accent" ? "rgb(92 200 245 / 0.55)" : n.tone === "warn" ? "rgb(250 178 25 / 0.5)" : "rgb(255 255 255 / 0.12)";
          const fill = n.tone === "accent" ? "rgb(92 200 245 / 0.08)" : n.tone === "warn" ? "rgb(250 178 25 / 0.06)" : "rgb(255 255 255 / 0.03)";
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.09, ease: EASE_OUT }}
            >
              <rect x={n.x} y={n.y} width={W} height={H} rx={12} fill={fill} stroke={stroke} strokeWidth={1} />
              <text x={cx(n)} y={n.y + 24} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--color-ink)">
                {n.title}
              </text>
              <text x={cx(n)} y={n.y + 41} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                {n.sub}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
