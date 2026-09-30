import clsx from "clsx";
import { ChevronDown, Download, RotateCcw, Upload, Users } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { pct } from "../../lib/format";
import type { Case, FeatureSchema, Patient } from "../../lib/types";
import { useIsModified, useStore } from "../../state/store";
import { FeatureField } from "./FeatureField";

function caseLabel(c: Case): string {
  return `#${c.patient_id} · ${c.subtitle} — CAD ${pct(c.predicted.cad)}`;
}

function CaseLibrary() {
  const cases = useStore((s) => s.cases);
  const activeCaseId = useStore((s) => s.activeCaseId);
  const schema = useStore((s) => s.schema);
  const loadPatient = useStore((s) => s.loadPatient);

  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id === "__median" && schema) {
      loadPatient(schema.default_patient, "Cohort median");
      return;
    }
    const c = cases.find((x) => x.id === id);
    if (c) loadPatient(c.features, c.title, c.id);
  };

  const sorted = useMemo(() => [...cases].sort((a, b) => b.predicted.cad - a.predicted.cad), [cases]);

  return (
    <label className="block">
      <span className="label-caps flex items-center gap-1.5">
        <Users size={12} /> Case library
      </span>
      <div className="relative mt-1.5">
        <select
          value={activeCaseId ?? "__median"}
          onChange={onChange}
          className="w-full appearance-none rounded-lg border border-line bg-raised py-2 pl-3 pr-8 text-xs text-ink focus:border-accent focus:outline-none"
        >
          <option value="__median">Reference patient (cohort median values)</option>
          <optgroup label={`Hold-out patients — never seen in training (${cases.length})`}>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {caseLabel(c)}
              </option>
            ))}
          </optgroup>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      </div>
    </label>
  );
}

function GroundTruth() {
  const c = useStore((s) => s.cases.find((x) => x.id === s.activeCaseId));
  const modified = useIsModified();
  if (!c) return null;
  const vessels = (["lad", "lcx", "rca"] as const).filter((v) => c.truth[v]).map((v) => v.toUpperCase());
  return (
    <p className={clsx("mt-2 rounded-lg border border-line bg-page/50 px-2.5 py-1.5 text-[11px]", modified ? "text-ink-3" : "text-ink-2")}>
      <span className="font-semibold text-ink">Angiography: </span>
      {c.truth.cad ? `CAD — stenotic ${vessels.length ? vessels.join(", ") : "vessel not specified"}` : "Normal coronaries"}
      {modified && " (inputs edited since loading)"}
    </p>
  );
}

function Toolbar() {
  const patient = useStore((s) => s.patient);
  const baseline = useStore((s) => s.baseline);
  const loadPatient = useStore((s) => s.loadPatient);
  const activeCaseId = useStore((s) => s.activeCaseId);
  const modified = useIsModified();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ features: patient }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardiolens-patient${activeCaseId ? `-${activeCaseId}` : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { features?: Patient } | Patient;
      const features = (data as { features?: Patient }).features ?? (data as Patient);
      if (typeof features !== "object" || Array.isArray(features)) throw new Error("expected an object of features");
      loadPatient(features, file.name);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid file");
    }
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn"
          disabled={!modified}
          onClick={() => baseline && loadPatient(baseline.patient, baseline.label, activeCaseId)}
          title="Undo all edits"
        >
          <RotateCcw size={13} /> Reset edits
        </button>
        <button type="button" className="btn" onClick={exportJson}>
          <Download size={13} /> Export
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Import
        </button>
        <input ref={fileInput} type="file" accept="application/json" className="hidden" onChange={importJson} />
      </div>
      {importError && <p className="mt-1 text-[11px] text-raises">Import failed: {importError}</p>}
    </div>
  );
}

function Group({ id, label, features }: { id: string; label: string; features: FeatureSchema[] }) {
  const [open, setOpen] = useState(id === "demographics" || id === "exam" || id === "echo");
  const abnormal = useStore((s) =>
    s.prediction?.physiology.filter((r) => r.group === id && (r.flag === "high" || r.flag === "low" || r.flag === "abnormal")).length,
  );
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-ink">{label}</span>
        <span className="flex items-center gap-2 text-[11px] text-ink-3">
          {abnormal ? `${abnormal} flagged` : null}
          <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="space-y-3 pb-3">
          {features.map((f) => (
            <FeatureField key={f.id} feature={f} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PatientPanel() {
  const schema = useStore((s) => s.schema);
  const baselineLabel = useStore((s) => s.baseline?.label);
  if (!schema) return <div className="panel h-full animate-pulse" aria-busy="true" />;

  return (
    <section className="panel flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3.5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Patient</h2>
          <span className="truncate text-[11px] text-ink-3">{baselineLabel}</span>
        </div>
        <CaseLibrary />
        <GroundTruth />
        <Toolbar />
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3.5">
        <p className="py-2.5 text-[11px] leading-snug text-ink-3">
          Edit any value to see the prediction, 3D colouring and explanation update live. Leave a field empty to let the
          model impute it from the cohort.
        </p>
        {schema.groups.map((g) => (
          <Group key={g.id} id={g.id} label={g.label} features={schema.features.filter((f) => f.group === g.id)} />
        ))}
      </div>
    </section>
  );
}
