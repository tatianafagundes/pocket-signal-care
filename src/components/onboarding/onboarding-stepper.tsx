import type { OnboardingStep } from "@/lib/onboarding-context";

/*
 * OnboardingStepper (Fuon). (Spec Fase 5 / Req 8, 9.1; WCAG 1.4.1, 4.1.2; Fase 7 conditional steps)
 *
 * The progress indicator across the wizard. It is an ordered list of dots with the current step
 * carrying aria-current="step". Success is the terminal step and is not shown as a pending dot.
 *
 * Since Fase 7 the working steps are CONDITIONAL (`sim`, `delivery`), so the list of dots is NOT a
 * module constant — the caller (WizardPage) computes it per flow with `workingStepsFor(state)` and
 * passes it in `steps`, so the dot count and the "Step N of M" announcement read the same sequence
 * and can't drift.
 *
 * State is NOT conveyed by colour alone: each dot has a visually-hidden label ("done" /
 * "current" / "upcoming") so a screen reader announces position, and the current dot is both
 * filled (accent) and larger — two non-colour signals. Decorative dots are aria-hidden; the real
 * position announcement is the status region in WizardPage ("Step N of M").
 */

interface OnboardingStepperProps {
  current: OnboardingStep;
  /** The working steps for THIS flow, in order (from `workingStepsFor`). */
  steps: readonly OnboardingStep[];
  /** Visually-hidden state labels, localized. */
  labels: { done: string; current: string; upcoming: string };
  /** Accessible name for the stepper as a whole, e.g. "Onboarding progress". */
  ariaLabel: string;
}

export function OnboardingStepper({ current, steps, labels, ariaLabel }: OnboardingStepperProps) {
  // Success has no dot; while on success (or any step not in this flow), treat all as done.
  const currentIndex = steps.indexOf(current);
  const activeIndex = currentIndex === -1 ? steps.length : currentIndex;

  return (
    <ol className="flex items-center gap-2" aria-label={ariaLabel}>
      {steps.map((step, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "current" : "upcoming";
        const isCurrent = state === "current";
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className="flex items-center"
          >
            <span
              aria-hidden="true"
              className={
                "block rounded-pill transition-colors " +
                (isCurrent
                  ? "h-2 w-5 bg-accent-ink"
                  : state === "done"
                    ? "h-2 w-2 bg-accent-ink"
                    : "h-2 w-2 bg-hairline")
              }
            />
            <span className="sr-only">{labels[state]}</span>
          </li>
        );
      })}
    </ol>
  );
}
