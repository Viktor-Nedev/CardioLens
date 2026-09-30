import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/store";

/** Loads schema, cases, metrics and importance once, then keeps predictions in sync. */
export function useBoot() {
  const setBoot = useStore((s) => s.setBoot);
  const setBootError = useStore((s) => s.setBootError);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.schema(), api.cases(), api.metrics(), api.importance()])
      .then(([schema, cases, metrics, importance]) => {
        if (!cancelled) setBoot({ schema, cases, metrics, importance });
      })
      .catch((err: unknown) => {
        if (!cancelled) setBootError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setBoot, setBootError]);
}

/** Debounced live prediction: every edit of the patient record re-scores all targets. */
export function usePredictionSync(delay = 140) {
  const patient = useStore((s) => s.patient);
  const ready = useStore((s) => Boolean(s.schema));
  const setPrediction = useStore((s) => s.setPrediction);
  const setPredicting = useStore((s) => s.setPredicting);
  const setPredictError = useStore((s) => s.setPredictError);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ready || Object.keys(patient).length === 0) return;
    const timer = window.setTimeout(() => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setPredicting(true);
      api
        .predict(patient, ctrl.signal)
        .then((p) => {
          if (!ctrl.signal.aborted) setPrediction(p);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          setPredictError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setPredicting(false);
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [patient, ready, delay, setPrediction, setPredicting, setPredictError]);
}
