import clsx from "clsx";
import { Activity, ShieldAlert } from "lucide-react";
import { useStore, type Tab } from "../../state/store";

const TABS: { id: Tab; label: string }[] = [
  { id: "analysis", label: "Patient analysis" },
  { id: "model", label: "Model performance" },
  { id: "about", label: "About & data" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#131c2a" />
        <path
          d="M16 26s-9-5.6-9-12.2A5 5 0 0 1 16 11a5 5 0 0 1 9 2.8C25 20.4 16 26 16 26Z"
          fill="none"
          stroke="#e66767"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 16h4l2-3.5 2.5 7 2-3.5h4.5"
          fill="none"
          stroke="#5cc8f5"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-ink">CardioLens</p>
        <p className="text-[10px] text-ink-3">Explainable coronary risk in 3D</p>
      </div>
    </div>
  );
}

function ApiStatus() {
  const predicting = useStore((s) => s.predicting);
  const latency = useStore((s) => s.prediction?.latency_ms);
  const error = useStore((s) => s.predictError);
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2" title={error}>
        <span className="h-2 w-2 rounded-full bg-risk-high" /> API error
      </span>
    );
  }
  return (
    <span className="tabular inline-flex items-center gap-1.5 text-[11px] text-ink-3">
      <Activity size={13} className={clsx(predicting ? "animate-pulse-soft text-accent" : "text-ink-3")} />
      {latency != null ? `Model ${latency.toFixed(0)} ms` : "Connecting…"}
    </span>
  );
}

export function Header() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/90 px-4 py-2.5 backdrop-blur">
      <Logo />
      <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id ? "bg-raised text-ink ring-1 ring-line-strong" : "text-ink-3 hover:bg-hover hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <ApiStatus />
    </header>
  );
}

export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 border-b border-[#fab219]/25 bg-[#fab219]/[0.07] px-4 py-1.5 text-[11px] leading-snug text-ink-2 sm:items-center"
    >
      <ShieldAlert size={14} className="mt-px shrink-0 text-[#fab219] sm:mt-0" aria-hidden />
      <p>
        <span className="font-semibold text-ink">Decision support and education only.</span> CardioLens estimates are
        statistical predictions, not a diagnosis, and do not replace coronary angiography, CT angiography or clinical
        judgement.
      </p>
    </div>
  );
}

export function DisclaimerModal() {
  const accepted = useStore((s) => s.disclaimerAccepted);
  const accept = useStore((s) => s.acceptDisclaimer);
  if (accepted) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="panel max-w-lg bg-raised p-6 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="text-[#fab219]" size={22} aria-hidden />
          <h2 id="disclaimer-title" className="text-base font-semibold text-ink">
            Before you continue
          </h2>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
          <li>CardioLens is a research and educational prototype for clinical decision support. It is not a medical device.</li>
          <li>
            Its models were trained on 303 patients from a single public dataset (Z-Alizadeh Sani, UCI). Probabilities
            are statistical estimates and can be wrong for an individual patient.
          </li>
          <li>
            The 3D colouring shows predicted risk per coronary artery. It is not an image of the patient and does not
            locate lesions; myocardial territories are schematic.
          </li>
          <li>
            Predictions never replace coronary angiography, CT angiography or the judgement of a qualified clinician.
          </li>
        </ul>
        <button
          type="button"
          onClick={accept}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-page transition hover:brightness-110"
          autoFocus
        >
          I understand
        </button>
      </div>
    </div>
  );
}
