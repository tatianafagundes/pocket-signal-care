import type { BucketState } from "@/services/model";

export type StatusTone = "warning" | "danger" | "success";

const DOT: Record<StatusTone, string> = {
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
};

/** Small status mark that sits beside a state word — the colour half of "colour + word". */
export function StatusDot({ tone }: { tone: StatusTone }) {
  return (
    <span className={`inline-block size-2 shrink-0 rounded-pill ${DOT[tone]}`} aria-hidden="true" />
  );
}

/** Which status tone a metered bucket state carries, if any (ok/expired/pending carry none). */
export function bucketTone(state: BucketState): StatusTone | null {
  if (state === "low") return "warning";
  if (state === "depleted") return "danger";
  return null;
}
