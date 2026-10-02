import clsx from "clsx";
import { ChevronDown, Search, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { riskColor } from "../../lib/colors";
import { pct } from "../../lib/format";
import { TARGET_ORDER, type Case } from "../../lib/types";
import { useStore } from "../../state/store";
import { EASE_OUT, Segmented } from "../ui/primitives";

type Sort = "high" | "low" | "id";

function truthText(c: Case): string {
  if (!c.truth.cad) return "Angio: normal coronaries";
  const v = (["lad", "lcx", "rca"] as const).filter((t) => c.truth[t]).map((t) => t.toUpperCase());
  return `Angio: CAD${v.length ? ` · ${v.join(", ")}` : ""}`;
}

function RiskDots({ c }: { c: Case }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {TARGET_ORDER.map((t) => (
        <span
          key={t}
          className="h-2 w-2 rounded-full ring-1 ring-black/40"
          style={{ background: riskColor(c.predicted[t]) }}
          title={`${t.toUpperCase()} ${pct(c.predicted[t])}`}
        />
      ))}
    </span>
  );
}

/** Searchable hold-out case library with per-target risk dots and angiography ground truth. */
export function CasePicker() {
  const cases = useStore((s) => s.cases);
  const activeCaseId = useStore((s) => s.activeCaseId);
  const schema = useStore((s) => s.schema);
  const loadPatient = useStore((s) => s.loadPatient);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("high");
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const current = cases.find((c) => c.id === activeCaseId);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = cases.filter((c) =>
      q ? `#${c.patient_id} ${c.subtitle} ${truthText(c)}`.toLowerCase().includes(q) : true,
    );
    const sorted = [...filtered].sort((a, b) =>
      sort === "id" ? a.patient_id - b.patient_id : sort === "high" ? b.predicted.cad - a.predicted.cad : a.predicted.cad - b.predicted.cad,
    );
    return sorted;
  }, [cases, query, sort]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => setCursor(0), [query, sort]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (c: Case | null) => {
    if (c) loadPatient(c.features, c.title, c.id);
    else if (schema) loadPatient(schema.default_patient, "Reference patient");
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => Math.min(items.length, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(cursor === 0 ? null : items[cursor - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <span className="label-caps flex items-center gap-1.5">
        <Users size={12} className="text-accent" /> Case library
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "mt-1.5 flex w-full items-center gap-2 rounded-lg border bg-black/30 px-3 py-2 text-left text-xs transition-colors",
          open ? "border-accent/60 text-ink" : "border-line text-ink hover:border-line-strong",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <>
              <span className="font-semibold">#{current.patient_id}</span>
              <span className="text-ink-2"> · {current.subtitle}</span>
            </>
          ) : (
            "Reference patient (cohort median values)"
          )}
        </span>
        {current && <RiskDots c={current} />}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-ink-3" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top center" }}
            className="panel absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden bg-[#0d141fF5] shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={13} className="text-ink-3" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search #id, age, findings…"
                className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-3 focus:outline-none"
                aria-label="Search hold-out patients"
                aria-controls="case-list"
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
              <span className="text-[10px] text-ink-3">
                {items.length} of {cases.length} unseen patients
              </span>
              <Segmented
                size="xs"
                ariaLabel="Sort cases"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "high", label: "Risk ↓" },
                  { value: "low", label: "Risk ↑" },
                  { value: "id", label: "#" },
                ]}
              />
            </div>
            <ul ref={list} id="case-list" role="listbox" className="scroll-slim max-h-72 overflow-y-auto p-1">
              {[null, ...items].map((c, i) => {
                const selected = c ? c.id === activeCaseId : !activeCaseId;
                const hot = i === cursor;
                return (
                  <li key={c?.id ?? "__ref"} data-index={i} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => choose(c)}
                      className="relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left"
                    >
                      {hot && (
                        <motion.span
                          layoutId="case-cursor"
                          className="absolute inset-0 rounded-md bg-white/[0.06] ring-1 ring-white/10"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate text-xs text-ink">
                          {c ? (
                            <>
                              <span className="font-semibold">#{c.patient_id}</span>
                              <span className="text-ink-2"> · {c.subtitle}</span>
                            </>
                          ) : (
                            "Reference patient"
                          )}
                          {selected && <span className="ml-1.5 text-[10px] font-semibold text-accent">current</span>}
                        </span>
                        <span className="block truncate text-[10px] text-ink-3">
                          {c ? truthText(c) : "Cohort median of every measurement"}
                        </span>
                      </span>
                      {c && (
                        <span className="relative flex shrink-0 flex-col items-end gap-1">
                          <span className="tabular text-[11px] font-semibold text-ink">CAD {pct(c.predicted.cad)}</span>
                          <RiskDots c={c} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {items.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-3">No matching patients</li>}
            </ul>
            <p className="border-t border-line px-3 py-1.5 text-[10px] text-ink-3">
              Dots: CAD · LAD · LCX · RCA predicted risk · ↑↓ to move, Enter to load
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
