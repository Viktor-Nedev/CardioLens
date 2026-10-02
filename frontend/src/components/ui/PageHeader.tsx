import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "./primitives";

/** Title block for full-width pages (model performance, about). */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
      className="relative mb-1 pt-2"
    >
      <p className="label-caps text-accent">{eyebrow}</p>
      <h1 className="mt-1.5 bg-gradient-to-r from-white via-[#d8ecff] to-[#7fcff5] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
        {title}
      </h1>
      {children && <div className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{children}</div>}
    </motion.header>
  );
}
