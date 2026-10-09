import { ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useStore } from "../../state/store";
import { PageHeader } from "../ui/PageHeader";
import { spotlightMove } from "../ui/effects";

function Card({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      onPointerMove={spotlightMove}
      className="panel spotlight p-5"
    >
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
    </motion.section>
  );
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
      {children}
      <ExternalLink size={11} />
    </a>
  );
}

export function About() {
  const schema = useStore((s) => s.schema);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader eyebrow="About & data" title="Explainable coronary risk, mapped onto real anatomy">
        CardioLens turns routine clinical data into calibrated, explained risk estimates for coronary artery disease
        and each major coronary artery, and shows them on a 3D heart.
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
      <Card index={0} title="What CardioLens does">
        <p>
          CardioLens estimates, from routine clinical data, the probability of coronary artery disease (CAD) and of
          significant (≥50%) stenosis in each of the three major coronary arteries: the left anterior descending (LAD),
          left circumflex (LCX) and right coronary artery (RCA).
        </p>
        <p>
          Each probability colours the matching artery of a 3D heart built from real anatomical meshes. Every estimate
          comes with a SHAP explanation and a breakdown of the patient's measurements and their contribution.
        </p>
      </Card>

      <Card index={1} title="Intended use and limitations">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>Educational and decision-support prototype; not a medical device and not validated for clinical use.</li>
          <li>Trained on 303 patients from a single centre. Performance on other populations is unknown.</li>
          <li>
            Vessel colours encode predicted probabilities, not imaged lesions. Myocardial territories are a schematic
            nearest-artery map and vary between real patients (coronary dominance).
          </li>
          <li>Regional wall-motion abnormality is used only as a model input, never as a spatial location.</li>
          <li>Hold-out metrics come from 61 patients and have wide confidence intervals.</li>
        </ul>
      </Card>

      <Card index={2} title="Data">
        <p>
          <A href="https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset">
            Extension of Z-Alizadeh Sani dataset
          </A>{" "}
          (UCI Machine Learning Repository, CC BY 4.0): 303 patients, demographic, clinical, ECG, laboratory and
          echocardiographic features, with angiography labels for CAD, LAD, LCX and RCA.
        </p>
        {schema && (
          <p className="text-xs text-ink-3">
            Model inputs: {schema.features.length} features in {schema.groups.length} groups. Excluded to prevent target
            leakage: {schema.excluded_columns.leakage.join(", ")}. Excluded as constant: {schema.excluded_columns.constant.join(", ")}.
          </p>
        )}
      </Card>

      <Card index={3} title="Anatomy">
        <p>
          3D meshes from <A href="https://lifesciencedb.jp/bp3d/">BodyParts3D</A> (© The Database Center for Life
          Science, CC BY-SA 2.1 Japan), via the STL mirror by K. M. Moerman. The coronary arteries come from the
          FMA-annotated primitives: LAD (FMA3862 and septal branches), LCX (FMA3895), RCA (FMA3802 with its marginal,
          posterolateral and posterior descending branches) and the left main stem (FMA4685).
        </p>
      </Card>

      <Card index={4} title="Method in brief">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>Stratified 80/20 development / hold-out split; the hold-out set is used exactly once.</li>
          <li>
            Four model families (elastic-net logistic regression, gradient boosting, random forest, SVM) compared with 5×
            repeated 5-fold nested cross-validation.
          </li>
          <li>Platt calibration on out-of-fold scores; Youden-optimal decision threshold.</li>
          <li>SHAP (linear or tree explainer) folded back to clinical features; bootstrap ensembles give an 80% interval.</li>
          <li>LIME, an independent local surrogate, cross-checks every SHAP explanation on demand.</li>
        </ul>
      </Card>

      <Card index={5} title="API and integration">
        <p>
          The dashboard is a client of a documented REST API, so the models can be used from other systems too.
          Interactive documentation: <A href="/docs">/docs</A>.
        </p>
        <ul className="space-y-1 font-mono text-xs text-ink-2">
          <li>POST /api/predict · probabilities, intervals, SHAP</li>
          <li>POST /api/profile · what-if curve for one factor</li>
          <li>POST /api/similar · most similar patients</li>
          <li>GET /api/cohort/map · map of the development cohort</li>
          <li>GET /api/dependence/&#123;feature&#125; · partial dependence</li>
          <li>POST /api/lime · LIME weights compared with SHAP</li>
          <li>GET /api/schema · /api/cases · /api/metrics</li>
        </ul>
      </Card>

      <Card index={6} title="How to use">
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>Pick a hold-out patient in the case library, or edit any measurement.</li>
          <li>Rotate and zoom the heart; click an artery, its label or a region of the myocardium to inspect it.</li>
          <li>Read the SHAP explanation (and its LIME cross-check) and the physiological breakdown for the selected target.</li>
          <li>Use Compare to see why the estimate differs from another patient, and Fly-through for a guided 3D tour.</li>
          <li>Open "Model performance" to see how well each model generalises; drag the threshold over the hold-out patients.</li>
          <li>Press Ctrl/⌘ K to search patients, views, layers and actions.</li>
        </ol>
      </Card>
      </div>
    </div>
  );
}
