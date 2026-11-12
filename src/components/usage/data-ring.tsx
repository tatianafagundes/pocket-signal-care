import type { BucketState } from "@/services/model";

/*
 * DataRing — the 88px allowance ring on the Home "Data" card (Figma P1 · "Data ring").
 *
 * An SVG donut whose filled arc is the CONSUMED fraction (matching the prototype: the arc grows as
 * the allowance is used, and the centre reads "{consumed} used"). The remaining amount is shown as
 * TEXT beside the ring by the card — the ring is reinforcement, not the primary fact (usage
 * research + DESIGN.md: a bare progressbar doesn't announce itself).
 *
 * Colour follows the bucket state (never colour alone — the card pairs it with a word):
 *   ok → brand accent · low → warning · depleted → danger.
 * Only metered, active buckets reach here; unlimited/expired/pending are handled by the card
 * (no misleading ring). No hardcoded colour — stroke classes map to design tokens.
 */

const SIZE = 88;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Stroke colour class for the consumed arc, by state. */
function arcClass(state: BucketState): string {
  switch (state) {
    case "low":
      return "stroke-warning";
    case "depleted":
      return "stroke-danger";
    default:
      // ok (and any state that still renders a ring) uses the brand accent as a graphic (>=3:1).
      return "stroke-accent-brand";
  }
}

export interface DataRingProps {
  state: BucketState;
  /** Consumed / total, 0..1. Passed in (computed once) so the card and ring agree. */
  consumedFraction: number;
  /** "3.8 GB" — the consumed amount shown large in the centre. */
  centreValue: string;
  /** Translated word under the value, e.g. "used". */
  centreCaption: string;
  /** Accessible sentence, e.g. "3.8 of 10 GB used" (already localized). */
  ariaLabel: string;
}

export function DataRing({
  state,
  consumedFraction,
  centreValue,
  centreCaption,
  ariaLabel,
}: DataRingProps) {
  // Clamp so a rounding overshoot (remaining slightly negative) never draws past full.
  const fraction = Math.max(0, Math.min(1, consumedFraction));
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {/* track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-hairline"
        />
        {/* consumed arc — starts at 12 o'clock, grows clockwise */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={`${arcClass(state)} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500`}
        />
      </svg>
      {/* centre: consumed amount + "used" — hidden from AT (the ring's aria-label already says it) */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        aria-hidden="true"
      >
        <span className="type-body-sm-strong text-text-primary tabular-figures">{centreValue}</span>
        <span className="type-caption text-text-secondary">{centreCaption}</span>
      </div>
    </div>
  );
}
