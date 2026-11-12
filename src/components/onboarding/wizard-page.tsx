import { useEffect, useRef, type ReactNode } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  type OnboardingStep,
} from "@/lib/onboarding-context";

/*
 * WizardPage (Fuon). The frame every onboarding step renders into. It mirrors PageShell's 390px
 * phone-column card, but adds the two things a wizard needs and PageShell deliberately doesn't:
 *
 *  1. FOCUS MANAGEMENT (WCAG 2.4.3). On each step change the heading receives focus
 *     (tabIndex={-1} + .focus()), so a keyboard/screen-reader user lands at the top of the new
 *     step instead of being stranded on a control that just unmounted.
 *  2. STATUS ANNOUNCEMENT (WCAG 4.1.3). A visually-hidden aria-live="polite" region announces
 *     "Step N of M, <title>" on each change, so the position is spoken without a visual-only cue.
 *
 * The stepper sits above the heading. `step` drives the progress dots, the N-of-M number, and the
 * focus/announce effect (keyed on it). Not used on a page outside the wizard.
 */

interface WizardPageProps {
  step: OnboardingStep;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function WizardPage({ step, title, subtitle, children }: WizardPageProps) {
  const { t } = useLocalizedTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 1-based position for display; success is the last step.
  const stepNumber = ONBOARDING_STEPS.indexOf(step) + 1;

  // Move focus to the heading when the step changes (client only; refs are null on the server).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const progressLabel = t("onboarding.stepProgress", "Step {{current}} of {{total}}", {
    current: stepNumber,
    total: ONBOARDING_STEP_COUNT,
  });

  return (
    <main className="mx-auto w-full max-w-[390px] px-5 pt-6 pb-28">
      {/* Progress announcement — polite, visually hidden; re-announced on each step change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {progressLabel}
        {". "}
        {title}
      </p>

      <div className="mb-5">
        <OnboardingStepper
          current={step}
          ariaLabel={t("onboarding.progressLabel", "Onboarding progress")}
          labels={{
            done: t("onboarding.step.done", "Completed step"),
            current: t("onboarding.step.current", "Current step"),
            upcoming: t("onboarding.step.upcoming", "Upcoming step"),
          }}
        />
        <p className="type-caption mt-2 text-text-secondary" aria-hidden="true">
          {progressLabel}
        </p>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="type-title text-text-primary outline-none">
        {title}
      </h1>
      <p className="type-body mt-1 text-text-secondary">{subtitle}</p>
      <div className="mt-6 rounded-card border border-hairline bg-surface p-5">{children}</div>
    </main>
  );
}
