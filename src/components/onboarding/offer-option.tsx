import { RadioGroupItem } from "@/components/ui/radio-group";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { offerPriceLabel } from "@/lib/format";
import type { Offer } from "@/services/model";
import type { QualifyResult } from "@/services/catalog-rules";

/*
 * OfferOption (Fuon "option-row"). One selectable plan in the grid. (Spec Fase 5 / Req 2, 8)
 *
 * It is a radio option wrapped as a card: the native radio drives selection (keyboard + screen
 * reader), the whole row is the label. The price states its nature (B4) via offerPriceLabel —
 * "€14.90 every 30 days · auto-renews", never a bare "€14.90" that reads as a one-off.
 *
 * Qualification (TMF679 tri-state) gates the row:
 *  - qualified   → selectable.
 *  - unqualified → the radio is disabled AND the reason (reasonKey) is shown, with aria-disabled
 *    so a screen reader hears it's unavailable and why. Colour is never the only signal.
 * The "recommended" plan carries a visible badge (not colour-only).
 */

interface OfferOptionProps {
  offer: Offer;
  /** Qualification for this offer; when undefined, treated as selectable (not yet checked). */
  qualify?: QualifyResult;
  recommendedLabel: string;
}

export function OfferOption({ offer, qualify, recommendedLabel }: OfferOptionProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();

  const unqualified = qualify?.result === "unqualified";
  const price = offerPriceLabel(offer, locale);
  const reasonText =
    unqualified && qualify?.reasonKey
      ? t(
          `onboarding.plan.ineligible.${qualify.reasonKey}`,
          t("onboarding.error.generic", "Unavailable"),
        )
      : null;

  const radioId = `offer-${offer.offerId}`;
  const descId = `${radioId}-desc`;

  return (
    <label
      htmlFor={radioId}
      aria-disabled={unqualified || undefined}
      className={
        "flex items-start gap-3 rounded-card border p-4 transition-colors " +
        (unqualified
          ? "border-hairline bg-surface-tint opacity-60"
          : "border-hairline bg-surface hover:border-accent-ink cursor-pointer")
      }
    >
      <RadioGroupItem
        id={radioId}
        value={offer.offerId}
        disabled={unqualified}
        aria-describedby={descId}
        className="mt-1"
      />
      <span id={descId} className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="type-body font-medium text-text-primary">{offer.name}</span>
          {offer.recommended === true ? (
            <span className="rounded-pill bg-accent-tint px-2 py-0.5 type-caption text-accent-ink">
              {recommendedLabel}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block type-body text-text-secondary">{offer.dataAmount}</span>
        <span className="mt-1 block type-caption text-text-secondary">
          {t(price.key, price.args)}
        </span>
        {offer.euRoaming === true ? (
          <span className="mt-1 block type-caption text-text-secondary">
            {t("onboarding.plan.euRoaming", "EU roaming included")}
          </span>
        ) : null}
        {reasonText ? (
          <span className="mt-2 block type-caption text-destructive">{reasonText}</span>
        ) : null}
      </span>
    </label>
  );
}
