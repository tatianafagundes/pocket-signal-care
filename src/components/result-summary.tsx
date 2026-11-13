import type { ReactNode, RefObject } from "react";

/**
 * Shared result-screen primitives for the transactional flows (top-up, voucher redeem). A result
 * screen is a tinted status circle + title + line (ResultHead), followed by a read-only receipt of
 * label/value rows (SummaryRow). Extracted once both flows needed them, so the success/failed heads
 * and the receipt rows stay identical across flows (Figma result-head + summary-card spec).
 */

/** The top of a result/handoff screen: a tinted circle with a status icon, a title and a line. */
export function ResultHead({
  tone,
  icon,
  title,
  body,
  headingRef,
}: {
  tone: "accent" | "success" | "danger";
  icon: ReactNode;
  title: string;
  body: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const tint =
    tone === "success"
      ? "bg-success-tint"
      : tone === "danger"
        ? "bg-danger-tint"
        : "bg-accent-tint";
  return (
    <div className="flex flex-col items-center gap-4 pt-4 text-center">
      <span className={`flex size-[72px] items-center justify-center rounded-full ${tint}`}>
        {icon}
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="type-title text-text-primary focus-ring">
        {title}
      </h2>
      <p className="type-body text-text-secondary">{body}</p>
    </div>
  );
}

/** One label/value row inside a summary card (read-only; not a tap target). */
export function SummaryRow({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 ${divider ? "border-t border-hairline" : ""}`}
    >
      <span className="type-body-sm-strong text-text-primary">{label}</span>
      <span className="type-body-sm text-text-secondary tabular-figures text-right">{value}</span>
    </div>
  );
}
