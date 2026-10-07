// Copy a link that reopens the current patient and explained target.
import { encodeShare } from "../lib/share";
import { useStore } from "./store";

export async function copyShareLink(): Promise<void> {
  const s = useStore.getState();
  if (!s.schema) return;
  const base = s.baseline?.patient;
  const edited = base ? Object.keys(s.patient).some((k) => s.patient[k] !== base[k]) : true;
  const hash = encodeShare(s.patient, s.schema.default_patient, s.selected, s.activeCaseId, edited);
  window.history.replaceState(null, "", `#${hash}`);
  const url = `${window.location.origin}${window.location.pathname}#${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    s.showToast("Link copied", "It reopens this patient and the explained target");
  } catch {
    s.showToast("Link ready in the address bar", "Copy it from there to share this patient");
  }
}
