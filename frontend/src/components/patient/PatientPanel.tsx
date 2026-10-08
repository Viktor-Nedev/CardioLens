import clsx from "clsx";
import {
  Activity,
  AudioWaveform,
  ChevronDown,
  ClipboardList,
  Download,
  FlaskConical,
  Link2,
  RotateCcw,
  Stethoscope,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ChangeEvent } from "react";
import type { FeatureSchema, Patient } from "../../lib/types";
import { copyShareLink } from "../../state/share";
import { useIsModified, useStore } from "../../state/store";
import { EASE_OUT } from "../ui/primitives";
import { CasePicker } from "./CasePicker";
import { FeatureField } from "./FeatureField";

const GROUP_ICON: Record<string, LucideIcon> = {
  demographics: UserRound,
  history: ClipboardList,
  exam: Stethoscope,
  ecg: Activity,
  labs: FlaskConical,
  echo: AudioWaveform,
};

function PatientCard() {
  const patient = useStore((s) => s.patient);
  const label = useStore((s) => s.baseline?.label);
  const c = useStore((s) => s.cases.find((x) => x.id === s.activeCaseId));
  const modified = useIsModified();
  const age = typeof patient.age === "number" ? Math.round(patient.age) : null;
  const sex = patient.sex_male === 1 ? "Male" : patient.sex_male === 0 ? "Female" : "Sex unknown";

  return (
    <motion.div
      key={c?.id ?? label}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3"
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3987e5]/40 to-[#e66767]/30 ring-1 ring-white/10">
        <UserRound size={20} className="text-ink" aria-hidden />
        {c && !modified && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-risk-low" title="Hold-out patient" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{label ?? "Patient"}</p>
        <p className="text-[11px] text-ink-3">
          {age != null ? `${age} years` : "Age unknown"} · {sex}
          {modified && <span className="text-[#fab219]"> · edited</span>}
        </p>
        {c && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(["cad", "lad", "lcx", "rca"] as const).map((t) => (
              <span
                key={t}
                className={clsx(
                  "rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase",
                  c.truth[t] ? "border-[#e66767]/40 bg-[#e66767]/10 text-ink" : "border-line bg-transparent text-ink-3",
                  modified && "opacity-50",
                )}
                title={`Angiography: ${t.toUpperCase()} ${c.truth[t] ? "positive" : "negative"}`}
              >
                {t}
                {c.truth[t] ? " +" : " −"}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
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
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className={clsx("btn justify-center", modified && "border-accent/40 text-ink")}
          disabled={!modified}
          onClick={() => baseline && loadPatient(baseline.patient, baseline.label, activeCaseId)}
          title="Undo all edits"
        >
          <RotateCcw size={13} /> Reset edits
        </button>
        <button
          type="button"
          className="btn justify-center"
          onClick={() => void copyShareLink()}
          title="Copy a link that reopens this patient"
        >
          <Link2 size={13} /> Share
        </button>
        <button type="button" className="btn justify-center" onClick={exportJson}>
          <Download size={13} /> Export
        </button>
        <button type="button" className="btn justify-center" onClick={() => fileInput.current?.click()}>
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
  const abnormal = useStore(
    (s) =>
      s.prediction?.physiology.filter(
        (r) => r.group === id && (r.flag === "high" || r.flag === "low" || r.flag === "abnormal"),
      ).length,
  );
  const Icon = GROUP_ICON[id] ?? ClipboardList;
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] transition-colors group-hover:bg-accent-soft">
            <Icon size={13} className="text-accent" aria-hidden />
          </span>
          {label}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-ink-3">
          {abnormal ? (
            <span className="rounded-full bg-[#fab219]/10 px-1.5 py-px text-[10px] font-medium text-[#fab219]">
              {abnormal} flagged
            </span>
          ) : null}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown size={14} />
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pb-3">
              {features.map((f) => (
                <FeatureField key={f.id} feature={f} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PatientPanel() {
  const schema = useStore((s) => s.schema);
  if (!schema) return <div className="panel skeleton h-full" aria-busy="true" />;

  return (
    <section className="panel flex h-full min-h-0 flex-col" data-tour="patient">
      <div className="space-y-3 border-b border-line p-4">
        <h2 className="label-caps flex items-center gap-1.5">
          <UserRound size={13} className="text-accent" aria-hidden /> Patient
        </h2>
        <PatientCard />
        <CasePicker />
        <Toolbar />
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4">
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
