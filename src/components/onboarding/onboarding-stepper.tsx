import { ONBOARDING_WORKING_STEPS, type OnboardingStep } from "@/lib/onboarding-context";

/*
 * OnboardingStepper (Fuon). (Spec Fase 5 / Req 8, 9.1; WCAG 1.4.1, 4.1.2)
 *
 * The progress indicator across the wizard. It is an ordered list of dots with the current step
 * carrying aria-current="step". Success is the terminal step and is not shown as a pending dot —
 * the stepper covers the steps the user actively works through (welcome…review), the shared
 * ONBOARDING_WORKING_STEPS, so the dot count and the "Step N of M" announcement can't drift apart.
 *
 * State is NOT conveyed by colour alone: each dot has a visually-hidden label ("done" /
 * "current" / "upcoming") so a screen reader announces position, and the current dot is both
 * filled (accent) and larger — two non-colour signals. Decorative dots are aria-hidden; the real
 * position announcement is the status region in WizardPage ("Step N of M").
 */

interface OnboardingStepperProps {
  current: OnboardingStep;
  /** Visually-hidden state labels, localized. */
  labels: { done: string; current: string; upcoming: string };
  /** Accessible name for the stepper as a whole, e.g. "Onboarding progress". */
  ariaLabel: string;
}

export function OnboardingStepper({ current, labels, ariaLabel }: OnboardingStepperProps) {
  // Success has no dot; while on success, treat every working step as done.
  const currentIndex = ONBOARDING_WORKING_STEPS.indexOf(
    current as (typeof ONBOARDING_WORKING_STEPS)[number],
  );
  const activeIndex = currentIndex === -1 ? ONBOARDING_WORKING_STEPS.length : currentIndex;

  return (
    <ol className="flex items-center gap-2" aria-label={ariaLabel}>
      {ONBOARDING_WORKING_STEPS.map((step, i) => {
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
