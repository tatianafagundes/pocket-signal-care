import { useEffect, useRef, type ReactNode } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import {
  ONBOARDING_WORKING_STEPS,
  ONBOARDING_WORKING_STEP_COUNT,
  type OnboardingStep,
} from "@/lib/onboarding-context";

/*
 * WizardPage (Fuon). The frame every onboarding step renders into. It mirrors PageShell's 390px
 * phone-column card, but adds the two things a wizard needs and PageShell deliberately doesn't:
 *
 *  1. FOCUS MANAGEMENT (WCAG 2.4.3). On each step change the heading receives focus
 *     (tabIndex={-1} + .focus()), so a keyboard/screen-reader user lands at the top of the new
 *     step instead of being stranded on a control that just unmounted.
 *  2. STATUS ANNOUNCEMENT (WCAG 4.1.3). A visually-hidden role="status" region announces
 *     "Step N of M, <title>" on each change, so the position is spoken without a visual-only cue.
 *     The count is the WORKING steps (M = 6), matching the stepper dots; the terminal success
 *     screen announces its title only, not "Step 7 of 7".
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

  // 1-based position among the working steps. Success is terminal (not a numbered step).
  const workingIndex = ONBOARDING_WORKING_STEPS.indexOf(
    step as (typeof ONBOARDING_WORKING_STEPS)[number],
  );
  const isWorkingStep = workingIndex !== -1;

  // Move focus to the heading when the step changes (client only; refs are null on the server).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Working steps announce "Step N of M, <title>"; success announces its title only.
  const progressLabel = isWorkingStep
    ? t("onboarding.stepProgress", "Step {{current}} of {{total}}", {
        current: workingIndex + 1,
        total: ONBOARDING_WORKING_STEP_COUNT,
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-[390px] px-5 pt-6 pb-28">
      {/* Progress announcement — polite status region, visually hidden; re-announced per step. */}
      <p className="sr-only" role="status">
        {progressLabel ? `${progressLabel}. ` : ""}
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
        {progressLabel ? (
          <p className="type-caption mt-2 text-text-secondary" aria-hidden="true">
            {progressLabel} · {title}
          </p>
        ) : null}
      </div>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="type-title rounded-control text-text-primary outline-none"
      >
        {title}
      </h1>
      <p className="type-body mt-1 text-text-secondary">{subtitle}</p>
      <div className="mt-6 rounded-card border border-hairline bg-surface p-5">{children}</div>
    </main>
  );
}
