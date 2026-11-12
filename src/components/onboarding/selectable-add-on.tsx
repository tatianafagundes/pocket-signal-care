import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice } from "@/lib/format";
import type { Offer } from "@/services/model";

/*
 * SelectableAddOn (Fuon). One add-on in the OPTIONAL onboarding add-ons step. (Spec Fase 5 / Req 3)
 *
 * A checkbox-as-card for MULTI-select — unlike the plan step's single-choice radio. There is no
 * qualification here: during onboarding there is no customer yet, so no balance to be short of;
 * the add-on simply joins the first order. Shows name, the localized "good for…" tagline, price,
 * and an expand-in-place "More info" with the description. Copy falls back to localized text keyed
 * by offerId (the add-on route copy under pages.addOns.offers.*), the same source the /add-ons
 * screen uses.
 */

interface SelectableAddOnProps {
  offer: Offer;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}

export function SelectableAddOn({ offer, checked, onToggle }: SelectableAddOnProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const [open, setOpen] = useState(false);

  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  const checkId = `addon-${offer.offerId}`;
  const detailId = `${checkId}-detail`;

  const tagline = offer.tagline ?? t(`pages.addOns.offers.${offer.offerId}.tagline`, "");
  const description =
    offer.description ?? t(`pages.addOns.offers.${offer.offerId}.description`, "");

  return (
    <div className="rounded-card border border-hairline bg-surface">
      <label htmlFor={checkId} className="flex items-start gap-3 p-4 cursor-pointer">
        <Checkbox
          id={checkId}
          checked={checked}
          onCheckedChange={(v) => onToggle(v === true)}
          className="mt-1"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="type-body font-medium text-text-primary">{offer.name}</span>
            <span className="type-body text-text-primary tabular-nums">{price}</span>
          </span>
          {tagline ? (
            <span className="mt-0.5 block type-caption text-text-secondary">{tagline}</span>
          ) : null}
        </span>
      </label>

      {/* Sibling of the label so it never toggles the checkbox. */}
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
        {open ? t("pages.addOns.lessInfo", "Less info") : t("pages.addOns.moreInfo", "More info")}
      </button>

      {open ? (
        <div id={detailId} className="border-t border-hairline px-4 pb-4 pt-3">
          <h3 className="type-caption font-medium text-text-primary">
            {t("pages.addOns.detailHeading", "What's included")}
          </h3>
          {description ? (
            <p className="mt-1 type-caption text-text-secondary">{description}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
