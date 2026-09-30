import { Check, Layers, MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { riskGradient } from "../../lib/colors";
import { useStore, type ViewerSettings } from "../../state/store";
import { VIEW_PRESETS } from "./CameraRig";

export function ViewBar() {
  const flyTo = useStore((s) => s.flyTo);
  return (
    <div className="absolute left-3 top-3 flex flex-wrap gap-1 rounded-lg border border-line bg-[#0b111bcc] p-1 backdrop-blur-md">
      {Object.entries(VIEW_PRESETS).map(([id, v]) => (
        <button key={id} type="button" className="btn-ghost" onClick={() => flyTo(id)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

const LAYERS: { key: keyof ViewerSettings; label: string; hint?: string }[] = [
  { key: "territories", label: "Perfusion territories", hint: "Schematic, by nearest artery" },
  { key: "labels", label: "Vessel labels" },
  { key: "xray", label: "X-ray myocardium" },
  { key: "torso", label: "Torso surface" },
  { key: "ribs", label: "Rib cage & sternum" },
  { key: "lungs", label: "Lungs & trachea" },
  { key: "greatVessels", label: "Aorta & venae cavae" },
  { key: "veins", label: "Cardiac veins" },
  { key: "heartbeat", label: "Heartbeat (patient pulse)" },
  { key: "autoRotate", label: "Auto-rotate" },
  { key: "performance", label: "Performance mode", hint: "Lower resolution, no animation" },
];

export function LayerMenu() {
  const viewer = useStore((s) => s.viewer);
  const toggle = useStore((s) => s.toggleViewer);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="absolute right-3 top-3">
      <button
        type="button"
        className="btn bg-[#0b111bcc] backdrop-blur-md"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={14} /> Layers
      </button>
      {open && (
        <div className="panel absolute right-0 mt-1.5 w-60 bg-[#0d141fee] p-1.5 shadow-2xl backdrop-blur-md">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={viewer[l.key]}
              onClick={() => toggle(l.key)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink"
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                  viewer[l.key] ? "border-accent bg-accent text-page" : "border-line-strong"
                }`}
              >
                {viewer[l.key] && <Check size={10} strokeWidth={3} />}
              </span>
              <span>
                {l.label}
                {l.hint && <span className="block text-[10px] text-ink-3">{l.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 w-52 rounded-lg border border-line bg-[#0b111bcc] px-3 py-2 backdrop-blur-md">
      <p className="text-[11px] font-medium text-ink-2">Predicted stenosis probability</p>
      <div className="mt-1.5 h-2 rounded-full" style={{ background: riskGradient() }} />
      <div className="tabular mt-1 flex justify-between text-[10px] text-ink-3">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-ink-3">Pulsing glow = above the model's decision threshold</p>
    </div>
  );
}

export function HoverCard() {
  const info = useStore((s) => s.hoverInfo);
  if (!info) {
    return (
      <div className="pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-lg border border-line bg-[#0b111bcc] px-2.5 py-1.5 text-[11px] text-ink-3 backdrop-blur-md lg:flex">
        <MousePointerClick size={13} /> Drag to rotate · scroll to zoom · click a vessel or region · keys 0–3
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-72 rounded-lg border border-line-strong bg-[#0b111bf0] px-3 py-2 shadow-xl"
      style={{ left: `min(${info.x + 14}px, calc(100% - 19rem))`, top: `min(${info.y + 14}px, calc(100% - 5rem))` }}
    >
      <p className="text-xs font-semibold text-ink">{info.title}</p>
      {info.detail && <p className="mt-0.5 text-[11px] text-ink-2">{info.detail}</p>}
    </div>
  );
}
