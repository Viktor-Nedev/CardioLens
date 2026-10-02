import clsx from "clsx";
import { Info, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { FeatureSchema } from "../../lib/types";
import { useStore } from "../../state/store";
import { Segmented } from "../ui/primitives";

function NumericField({ f }: { f: FeatureSchema }) {
  const value = useStore((s) => s.patient[f.id]);
  const setFeature = useStore((s) => s.setFeature);
  const [text, setText] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  const [lo, hi] = f.range ?? [f.stats.min ?? 0, f.stats.max ?? 100];
  const num = typeof value === "number" ? value : null;
  const fill = num == null ? 0 : ((num - lo) / (hi - lo)) * 100;

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      setFeature(f.id, null);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) setFeature(f.id, n);
  };

  const outOfRef = num != null && f.ref ? num < f.ref[0] || num > f.ref[1] : false;

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={lo}
        max={hi}
        step={f.step ?? 1}
        value={num ?? (f.stats.default as number)}
        onChange={(e) => setFeature(f.id, Number(e.target.value))}
        style={{ ["--fill" as string]: `${Math.min(100, Math.max(0, fill))}%` }}
        className={clsx("min-w-0 flex-1", num == null && "opacity-40")}
        aria-label={`${f.label} slider`}
      />
      <div className="relative w-24 shrink-0">
        <input
          type="number"
          inputMode="decimal"
          step={f.step ?? "any"}
          value={text}
          placeholder="impute"
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          className={clsx(
            "tabular w-full rounded-md border bg-page py-1 pl-2 pr-9 text-right text-xs text-ink placeholder:italic placeholder:text-ink-3 focus:border-accent focus:outline-none",
            outOfRef ? "border-[#fab219]/50" : "border-line",
          )}
          aria-label={f.label}
        />
        {f.unit && (
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">
            {f.unit.length > 6 ? "" : f.unit}
          </span>
        )}
      </div>
    </div>
  );
}

function ChoiceField({ f }: { f: FeatureSchema }) {
  const value = useStore((s) => s.patient[f.id]);
  const setFeature = useStore((s) => s.setFeature);
  const options = (f.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  return (
    <Segmented
      size="xs"
      ariaLabel={f.label}
      value={value as string | number | null}
      onChange={(v) => setFeature(f.id, v)}
      options={options}
    />
  );
}

export function FeatureField({ feature: f }: { feature: FeatureSchema }) {
  const value = useStore((s) => s.patient[f.id]);
  const base = useStore((s) => s.baseline?.patient[f.id]);
  const resetFeature = useStore((s) => s.resetFeature);
  const modified = base !== undefined && value !== base;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-xs text-ink-2">
          <span className="truncate">{f.label}</span>
          {f.description && (
            <span title={f.description} className="shrink-0 text-ink-3">
              <Info size={11} />
            </span>
          )}
          <AnimatePresence>
            {modified && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgb(92_200_245/0.9)]"
                title="Edited"
              />
            )}
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-ink-3">
          {f.ref && (
            <span className="tabular">
              ref {f.ref[0]}–{f.ref[1]}
              {f.unit && f.unit.length > 6 ? ` ${f.unit}` : ""}
            </span>
          )}
          {modified && (
            <button type="button" onClick={() => resetFeature(f.id)} className="text-ink-3 hover:text-ink" title="Revert this field">
              <Undo2 size={12} />
            </button>
          )}
        </span>
      </div>
      {f.kind === "numeric" ? <NumericField f={f} /> : <ChoiceField f={f} />}
    </div>
  );
}
