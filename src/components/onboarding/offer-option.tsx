import { RadioGroupItem } from "@/components/ui/radio-group";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { offerPriceLabel } from "@/lib/format";
import type { Offer } from "@/services/model";

/*
 * OfferOption (Fuon "option-row"). One selectable plan in the grid. (Spec Fase 5 / Req 2, 8)
 *
 * It is a radio option wrapped as a card: the native radio drives selection (keyboard + screen
 * reader), the whole row is the label. The price states its nature (B4) via offerPriceLabel —
 * "€14.90 every 30 days · auto-renews", never a bare "€14.90" that reads as a one-off. The
 * "recommended" plan carries a visible badge (not colour-only).
 *
 * Onboarding offers are always selectable (no customer yet → always qualified). The TMF679
 * tri-state "unqualified" rendering belongs to the future add-ons route (an existing customer
 * whose balance can't cover an offer); it will be added here when that route needs it.
 */

interface OfferOptionProps {
  offer: Offer;
  recommendedLabel: string;
}

export function OfferOption({ offer, recommendedLabel }: OfferOptionProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();

  const price = offerPriceLabel(offer, locale);
  const radioId = `offer-${offer.offerId}`;
  const descId = `${radioId}-desc`;

  return (
    <label
      htmlFor={radioId}
      className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-4 transition-colors hover:border-accent-ink cursor-pointer"
    >
      <RadioGroupItem
        id={radioId}
        value={offer.offerId}
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
      </span>
    </label>
  );
}
