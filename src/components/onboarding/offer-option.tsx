import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { RadioGroupItem } from "@/components/ui/radio-group";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { formatPrice } from "@/lib/format";
import type { Offer } from "@/services/model";

/*
 * OfferOption (Fuon "option-row"). One selectable plan in the grid. (Spec Fase 5 / Req 2, 8)
 *
 * It is a radio option wrapped as a card: the native radio drives selection (keyboard + screen
 * reader), the whole row is the label. The price states its nature — "Renews every 30 days" —
 * never a bare amount that reads as one-off. The "recommended" plan carries a visible badge.
 *
 * TAGLINE + MORE INFO. Each plan shows a one-line "good for…" tagline, and a "More info" toggle
 * expands an in-place panel with the long description and the plan's characteristics. The tagline
 * and description come from the Offer when a real catalogue provides them (TMF620: description is
 * native, the tagline is a characteristic), and otherwise fall back to localized copy keyed by
 * offerId — so the mock demo text is translatable.
 *
 * The toggle sits OUTSIDE the radio's <label> on purpose: a button inside the label would also
 * toggle the radio selection. Here the label wraps only the radio + summary; the toggle and the
 * detail panel are siblings, so "More info" never changes the selection.
 */

interface OfferOptionProps {
  offer: Offer;
  recommendedLabel: string;
}

export function OfferOption({ offer, recommendedLabel }: OfferOptionProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const [open, setOpen] = useState(false);

  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  const radioId = `offer-${offer.offerId}`;
  const descId = `${radioId}-desc`;
  const detailId = `${radioId}-detail`;

  // Prefer catalogue-provided copy; fall back to localized copy keyed by offerId.
  const tagline = offer.tagline ?? t(`onboarding.plan.offers.${offer.offerId}.tagline`, "");
  const description =
    offer.description ?? t(`onboarding.plan.offers.${offer.offerId}.description`, "");

  // Characteristics shown in the detail panel (icon-free list; each is a plain fact, not colour).
  const features: string[] = [];
  if (offer.unlimitedData === true) {
    features.push(t("onboarding.plan.feature.unlimited", "Unlimited data"));
  } else {
    features.push(
      t("onboarding.plan.feature.data", "{{data}} of data", { data: offer.dataAmount }),
    );
  }
  if (offer.network) {
    features.push(
      t("onboarding.plan.feature.network", "{{network}} network", { network: offer.network }),
    );
  }
  if (offer.euRoaming === true) {
    features.push(t("onboarding.plan.feature.euRoaming", "EU roaming included"));
  }
  if (offer.validityDays != null) {
    features.push(
      t("onboarding.plan.feature.validity", "{{days}}-day cycle", { days: offer.validityDays }),
    );
  }
  if (offer.autoRenew === true) {
    features.push(t("onboarding.plan.feature.autoRenew", "Renews automatically"));
  }

  return (
    // Selected state = a 2px accent-ink ring (DESIGN.md), driven by the radio's data-state via
    // `has-[]` — so selection is signalled by the card ring AND the radio dot, not colour alone.
    // The ring is 1px border + 1px outline: thickening the border instead would shift the card
    // content by 1px the moment a plan is picked, which makes the radio dot look off-centre.
    <div className="rounded-card border border-hairline bg-surface transition-colors hover:border-accent-ink has-[[data-state=checked]]:border-accent-ink has-[[data-state=checked]]:outline has-[[data-state=checked]]:outline-1 has-[[data-state=checked]]:outline-accent-ink">
      <label htmlFor={radioId} className="flex items-start gap-3 p-4 cursor-pointer">
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
          {tagline ? (
            <span className="mt-0.5 block type-caption text-text-secondary">{tagline}</span>
          ) : null}
          <span className="mt-1 flex items-baseline justify-between gap-2">
            <span className="type-body text-text-secondary">{offer.dataAmount}</span>
            <span className="type-title text-text-primary tabular-nums">{price}</span>
          </span>
          {offer.validityDays != null ? (
            <span className="mt-1 block type-caption text-text-primary">
              {offer.autoRenew === true
                ? t("onboarding.plan.renewNote", "Renews every {{days}} days · cancel anytime", {
                    days: offer.validityDays,
                  })
                : t("onboarding.plan.validNote", "Valid for {{days}} days", {
                    days: offer.validityDays,
                  })}
            </span>
          ) : null}
        </span>
      </label>

      {/* "More info" toggle — sibling of the label so it never toggles the radio. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className="focus-ring flex min-h-11 w-full items-center gap-1 rounded-b-card px-4 py-2 type-caption text-accent-ink"
      >
        <ChevronDown
          className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")}
          aria-hidden="true"
        />
        {open
          ? t("onboarding.plan.lessInfo", "Less info")
          : t("onboarding.plan.moreInfo", "More info")}
      </button>

      {open ? (
        <div id={detailId} className="border-t border-hairline px-4 pb-4 pt-3">
          <h3 className="type-caption font-medium text-text-primary">
            {t("onboarding.plan.detailHeading", "What's included")}
          </h3>
          {description ? (
            <p className="mt-1 type-caption text-text-secondary">{description}</p>
          ) : null}
          <ul className="mt-2 grid gap-1">
            {features.map((f) => (
              <li key={f} className="type-caption text-text-secondary">
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
