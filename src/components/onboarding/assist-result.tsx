import { forwardRef } from "react";

import { Button } from "@/components/ui/button";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { formatPrice } from "@/lib/format";
import type { Offer } from "@/services/model";
import type { Recommendation } from "@/services/recommendation-rules";

/*
 * The "help me choose" answer: ONE plan with its price, the estimate behind it, and the reason.
 * A cheaper plan is named honestly when it may be enough. One primary action chooses the plan.
 */
interface AssistResultProps {
  result: Recommendation;
  offers: Offer[];
  onChoose: (offerId: string) => void;
  onRestart: () => void;
}

export const AssistResult = forwardRef<HTMLHeadingElement, AssistResultProps>(function AssistResult(
  { result, offers, onChoose, onRestart },
  headingRef,
) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const offer = offers.find((o) => o.offerId === result.offerId);
  if (!offer) return null;

  const alternative = result.cheaperAlternative
    ? offers.find((o) => o.offerId === result.cheaperAlternative?.offerId)
    : undefined;
  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  const leaf = result.reason.replace("assist.reason.", "");

  return (
    <div role="status">
      <p className="type-caption font-medium text-accent-ink">
        {t("onboarding.plan.assist.resultLabel", "Suggested for you")}
      </p>
      <h3 ref={headingRef} tabIndex={-1} className="mt-1 type-title text-text-primary outline-none">
        {offer.name}
      </h3>
      <p className="mt-1 flex items-baseline justify-between gap-2">
        <span className="type-body text-text-secondary">{offer.dataAmount}</span>
        <span className="type-heading text-text-primary tabular-nums">
          {offer.validityDays != null
            ? t("onboarding.plan.assist.pricePer", "{{price}} / {{days}} days", {
                price,
                days: offer.validityDays,
              })
            : price}
        </span>
      </p>

      <div className="mt-4 grid gap-2 rounded-control bg-surface p-3">
        <p className="type-body text-text-primary">
          {t("onboarding.plan.assist.estimate", "We estimate you use about {{gb}} GB a month.", {
            gb: result.estimateGb,
          })}
        </p>
        <p className="type-caption text-text-secondary">
          {t(`onboarding.plan.assist.reason.${leaf}`, "", {
            plan: offer.name,
            data: offer.dataAmount,
          })}
        </p>
        {result.includesEuRoaming ? (
          <p className="type-caption text-text-secondary">
            {t(
              "onboarding.plan.assist.euRoaming",
              "Includes EU roaming, so you can use it like at home.",
            )}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        className="mt-4 min-h-11 w-full"
        onClick={() => onChoose(offer.offerId)}
      >
        {t("onboarding.plan.assist.choose", "Choose {{plan}}", { plan: offer.name })}
      </Button>

      {alternative && result.cheaperAlternative ? (
        <div className="mt-3 rounded-control border border-hairline p-3">
          <p className="type-caption text-text-secondary">
            {t(
              "onboarding.plan.assist.alternative",
              "Often on Wi-Fi? {{plan}} with {{data}} could be enough and costs {{saving}} less.",
              {
                plan: alternative.name,
                data: alternative.dataAmount,
                saving: formatPrice(result.cheaperAlternative.savingMinor, offer.currency, locale),
              },
            )}
          </p>
          <Button
            type="button"
            variant="link"
            className="mt-1 h-auto min-h-11 px-0 text-accent-ink"
            onClick={() => onChoose(alternative.offerId)}
          >
            {t("onboarding.plan.assist.chooseAlternative", "Choose {{plan}} instead", {
              plan: alternative.name,
            })}
          </Button>
        </div>
      ) : null}

      <p className="mt-3 type-caption text-text-secondary">
        {t(
          "onboarding.plan.assist.reassurance",
          "Prepaid, so there's no risk: change your plan or add data anytime.",
        )}
      </p>

      <Button type="button" variant="ghost" className="mt-2 min-h-11 w-full" onClick={onRestart}>
        {t("onboarding.plan.assist.restart", "Change answers")}
      </Button>
    </div>
  );
});
