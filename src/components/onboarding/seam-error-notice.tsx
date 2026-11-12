import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  // Resolve copy for this error. Seam error codes (e.g. "auth.register.emailInUse") are looked up
  // under the onboarding.seamError.* tree; i18next nests on the dots. If the seam marked the error
  // customer-facing with its own key, that key is tried as-is. Anything unmapped falls back to a
  // generic message, so a raw code is never shown to the user.
  const generic = t("onboarding.error.generic", "Something went wrong. Please try again.");
  const mapped = t(`onboarding.seamError.${error.customerKey}`, "");
  const message = mapped !== "" ? mapped : t(error.customerKey, generic);

  return (
    // Fuon danger notice: danger-tint fill + full-opacity danger border (the shadcn destructive
    // variant ships a white fill + 50% border, too weak a signal). role="alert" is on Alert.
    <Alert
      variant="destructive"
      className={cn(
        "rounded-card border-danger bg-danger-tint text-danger [&>svg]:text-danger",
        className,
      )}
    >
      <AlertDescription className="flex flex-col gap-3 text-danger">
        <span>{message}</span>
        {error.retryable && onRetry ? (
          // Secondary pill, no shadow (Fuon): a surface pill on the tint, not the shadcn
          // rounded-md/shadow-sm outline button.
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start rounded-pill border-danger bg-surface shadow-none text-danger hover:bg-surface"
            onClick={onRetry}
          >
            {t("onboarding.error.retry", "Try again")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
