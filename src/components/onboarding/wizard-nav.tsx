import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Button } from "@/components/ui/button";

/*
 * WizardNav (Fuon). The back / continue control at the foot of a wizard step. (Spec Fase 5 / Req 1)
 *
 * "Continue" is the primary action (Button default = the brand-filled primary). "Back" is a ghost
 * button and is omitted on the first step. The parent passes handlers (usually a navigate or a
 * form submit) rather than routes, so a step can validate / call a seam before advancing and can
 * disable/label Continue while a request is in flight.
 */

interface WizardNavProps {
  /** Back handler; omit to hide the Back button (first step). */
  onBack?: () => void;
  /** Continue handler. Omit `onContinue` when Continue submits a form (use `continueType="submit"`). */
  onContinue?: () => void;
  continueType?: "button" | "submit";
  /** Disable Continue (e.g. nothing selected, or a request in flight). */
  continueDisabled?: boolean;
  /** Override the Continue label (e.g. "Confirm and activate" on review). */
  continueLabel?: string;
  /** Busy state — labels Continue and blocks double submits. */
  busy?: boolean;
}

export function WizardNav({
  onBack,
  onContinue,
  continueType = "button",
  continueDisabled = false,
  continueLabel,
  busy = false,
}: WizardNavProps) {
  const { t } = useLocalizedTranslation();

  return (
    <div className="mt-6 flex items-center gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          {t("onboarding.nav.back", "Back")}
        </Button>
      ) : null}
      <Button
        type={continueType}
        onClick={continueType === "submit" ? undefined : onContinue}
        disabled={continueDisabled || busy}
        className="ml-auto min-h-11"
        aria-busy={busy}
      >
        {continueLabel ?? t("onboarding.nav.continue", "Continue")}
      </Button>
    </div>
  );
}
