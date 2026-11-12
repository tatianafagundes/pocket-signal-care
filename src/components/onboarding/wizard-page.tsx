import { useEffect, useRef, type ReactNode } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useOnboarding } from "@/hooks/use-onboarding";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { workingStepsFor, type OnboardingStep } from "@/lib/onboarding-context";

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
  /*
   * Does this tenant offer eSIM? Controls whether `/sim` is a step (dossiê R-2). Default true
   * (both demo brands offer eSIM). A route that knows the catalogue can pass false to drop `/sim`.
   */
  offersEsim?: boolean;
  children?: ReactNode;
}

export function WizardPage({
  step,
  title,
  subtitle,
  offersEsim = true,
  children,
}: WizardPageProps) {
  const { t } = useLocalizedTranslation();
  const { state } = useOnboarding();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The working steps for THIS flow (conditional on eSIM offer + chosen SIM type). One source for
  // the stepper dots and the "Step N of M" number, so they can't drift.
  const steps = workingStepsFor({ offersEsim, simType: state.simType });

  // 1-based position among the working steps. Success is terminal (not a numbered step).
  const workingIndex = steps.indexOf(step as (typeof steps)[number]);
  const isWorkingStep = workingIndex !== -1;

  /*
   * S5 (UX): the total must not shrink on screen. Before the user has committed to a SIM type,
   * the flow could still branch (physical keeps `/delivery`, eSIM drops it), so we HIDE the M
   * number until `simType` is chosen. Choosing eSIM then only ever removes a step the user hadn't
   * seen counted. `offersEsim === false` means there's no `/sim` branch at all, so M is stable
   * from the start and we show it immediately.
   */
  const simChoicePending = offersEsim && state.simType === null;
  const showTotal = !simChoicePending;

  // Move focus to the heading when the step changes (client only; refs are null on the server).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Working steps announce "Step N of M, <title>"; success announces its title only. While the
  // SIM choice is pending, announce the position without the (not-yet-stable) total.
  const progressLabel = !isWorkingStep
    ? null
    : showTotal
      ? t("onboarding.stepProgress", "Step {{current}} of {{total}}", {
          current: workingIndex + 1,
          total: steps.length,
        })
      : t("onboarding.stepProgressNoTotal", "Step {{current}}", { current: workingIndex + 1 });

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
          steps={steps}
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
        /* focus-ring (not outline-none): the heading receives programmatic focus on each step
           change, so a keyboard user must SEE where they landed. focus-ring scopes to
           :focus-visible, so a pointer interaction won't show it. */
        className="focus-ring type-title rounded-control text-text-primary"
      >
        {title}
      </h1>
      <p className="type-body mt-1 text-text-secondary">{subtitle}</p>
      <div className="mt-6 rounded-card border border-hairline bg-surface p-5">{children}</div>
    </main>
  );
}
