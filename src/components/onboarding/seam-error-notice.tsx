import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SeamFailure } from "@/services/api";

/*
 * SeamErrorNotice (Fuon). The one place a seam failure becomes screen copy. (Spec Fase 5 / Req 8)
 *
 * Every seam call throws a SeamFailure carrying a `customerKey` (an i18n key when the seam marked
 * the error customer-facing, else the raw code) and `retryable`. This maps that to a localized,
 * non-technical message in a destructive Alert (role="alert", so a screen reader announces it),
 * and shows a Retry affordance ONLY when the failure is retryable (category "unavailable"). A
 * validation/conflict error is not retryable — the user must change input — so no retry button.
 *
 * It never shows a raw code or stack to the user. If the customerKey isn't a known i18n key, the
 * translation falls back to a generic "something went wrong" message.
 */

interface SeamErrorNoticeProps {
  error: SeamFailure;
  /** Called when the user clicks Retry. Only rendered when `error.retryable`. */
  onRetry?: () => void;
  className?: string;
}

export function SeamErrorNotice({ error, onRetry, className }: SeamErrorNoticeProps) {
  const { t } = useLocalizedTranslation();

  // customerKey is an i18n key when available; fall back to a generic message otherwise.
  const message = t(
    error.customerKey,
    t("onboarding.error.generic", "Something went wrong. Please try again."),
  );

  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription className="flex flex-col gap-3">
        <span>{message}</span>
        {error.retryable && onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onRetry}
          >
            {t("onboarding.error.retry", "Try again")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
