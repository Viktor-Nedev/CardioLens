import { ArrowRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { LOWERS, RAISES } from "../../lib/colors";
import { pct, pp, signed } from "../../lib/format";
import { TARGET_ORDER, type Contribution, type TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { DataTable, LegendKey, Section, Segmented } from "../ui/primitives";

const TOP_N = 10;

function ContributionRow({ c, max }: { c: Contribution; max: number }) {
  const [hover, setHover] = useState(false);
  const share = Math.min(1, Math.abs(c.contribution) / max);
  const positive = c.contribution >= 0;
  return (
    <li
      className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2 rounded-md px-1.5 py-1 outline-none hover:bg-hover focus-visible:bg-hover"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="min-w-0">
        <p className="truncate text-xs text-ink">{c.label}</p>
        <p className="truncate text-[11px] text-ink-3">
          {c.display}
          {c.imputed && " · imputed"}
        </p>
      </div>
      <div className="relative flex h-5 items-center">
        {/* zero line in the middle; bars grow outward from it */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-axis" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 transition-all duration-500"
          style={{
            background: positive ? RAISES : LOWERS,
            width: `${share * 50}%`,
            left: positive ? "50%" : `${50 - share * 50}%`,
            borderRadius: positive ? "0 4px 4px 0" : "4px 0 0 4px",
          }}
        />
        <span
          className="tabular absolute text-[11px] text-ink-2"
          style={positive ? { left: `calc(${50 + share * 50}% + 4px)` } : { right: `calc(${50 + share * 50}% + 4px)` }}
        >
          {pp(c.delta_pp)}
        </span>
      </div>
      {hover && (
        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 w-60 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-[#0b111bf2] px-3 py-2 shadow-xl">
          <p className="tabular text-sm font-semibold text-ink">{pp(c.delta_pp)}</p>
          <p className="text-[11px] text-ink-2">
            {c.label}: {c.display}
          </p>
          <p className="tabular mt-1 text-[11px] text-ink-3">
            SHAP {signed(c.contribution)} log-odds · {positive ? "raises" : "lowers"} the estimate
          </p>
        </div>
      )}
    </li>
  );
}

export function ExplanationPanel() {
  const prediction = useStore((s) => s.prediction);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const [view, setView] = useState<"chart" | "table">("chart");

  const pred = prediction?.targets[selected];
  const { top, rest, max } = useMemo(() => {
    const list = pred?.contributions ?? [];
    const top = list.slice(0, TOP_N);
    const restList = list.slice(TOP_N);
    const restSum = restList.reduce((a, c) => a + c.contribution, 0);
    const max = Math.max(1e-6, ...top.map((c) => Math.abs(c.contribution)), Math.abs(restSum));
    return { top, rest: { count: restList.length, sum: restSum }, max };
  }, [pred]);

  if (!prediction || !pred) return <div className="panel h-96 animate-pulse" aria-busy="true" />;

  return (
    <Section
      title="Why this estimate?"
      right={
        <Segmented
          size="xs"
          ariaLabel="Explained target"
          value={selected}
          onChange={(t: TargetId) => select(t)}
          options={TARGET_ORDER.map((t) => ({ value: t, label: prediction.targets[t].short }))}
        />
      }
    >
      <p className="text-xs leading-relaxed text-ink-2">{pred.summary}</p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-page/50 px-3 py-2 text-xs">
        <span className="text-ink-3">Average patient</span>
        <span className="tabular font-semibold text-ink">{pct(pred.base_probability)}</span>
        <ArrowRight size={13} className="text-ink-3" aria-hidden />
        <span className="text-ink-3">This patient</span>
        <span className="tabular font-semibold text-ink">{pct(pred.probability)}</span>
        <span className="ml-auto text-[11px] text-ink-3">{pred.model}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-4 text-[11px] text-ink-2">
          <LegendKey kind="rect" color={RAISES} label="Raises risk" />
          <LegendKey kind="rect" color={LOWERS} label="Lowers risk" />
        </div>
        <Segmented
          size="xs"
          ariaLabel="Chart or table view"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      {view === "chart" ? (
        <>
          <ul className="mt-2 space-y-0.5">
            {top.map((c) => (
              <ContributionRow key={c.feature} c={c} max={max} />
            ))}
            {rest.count > 0 && (
              <ContributionRow
                c={{
                  feature: "__rest",
                  label: `${rest.count} other features`,
                  display: "combined",
                  contribution: rest.sum,
                  delta_pp: 100 * (pred.probability - 1 / (1 + Math.exp(-(pred.logit - rest.sum)))),
                  imputed: false,
                }}
                max={max}
              />
            )}
          </ul>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
            <Info size={12} className="mt-px shrink-0" aria-hidden />
            Bar length is the SHAP contribution in log-odds (additive: they sum from the average patient to this patient).
            Labels show the approximate change in probability each factor causes.
          </p>
        </>
      ) : (
        <div className="mt-2">
          <DataTable
            head={["Feature", "Value", "SHAP (log-odds)", "≈ Δ probability"]}
            rows={pred.contributions.map((c) => [c.label, c.display + (c.imputed ? " (imputed)" : ""), signed(c.contribution, 3), pp(c.delta_pp)])}
          />
        </div>
      )}
    </Section>
  );
}
