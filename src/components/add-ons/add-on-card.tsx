import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { formatPrice } from "@/lib/format";
import type { Offer } from "@/services/model";
import type { QualifyResult } from "@/services/catalog-rules";

/*
 * AddOnCard (Fuon). One add-on on the add-ons route. (Spec Fase 5 / Req 2, 8)
 *
 * Browse card (not a radio — add-ons aren't a single-choice grid like the plan step). It shows the
 * name, the localized "good for…" tagline, the price, and an expand-in-place "More info" with the
 * long description. It renders the TMF679 qualification tri-state for an EXISTING customer: when
 * the add-on costs more than the balance, qualify is "unqualified" and the reason is shown (not
 * colour-only), the card dimmed and aria-disabled. Buying is deferred (Fase 6) — see buyNote.
 */

interface AddOnCardProps {
  offer: Offer;
  /** Qualification for the current customer; undefined while it loads. */
  qualify?: QualifyResult;
  buyNote: string;
}

export function AddOnCard({ offer, qualify, buyNote }: AddOnCardProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const [open, setOpen] = useState(false);

  const unqualified = qualify?.result === "unqualified";
  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  const detailId = `addon-${offer.offerId}-detail`;

  const tagline = offer.tagline ?? t(`pages.addOns.offers.${offer.offerId}.tagline`, "");
  const description =
    offer.description ?? t(`pages.addOns.offers.${offer.offerId}.description`, "");
  const reasonText =
    unqualified && qualify?.reasonKey
      ? t(`pages.addOns.ineligible.${qualify.reasonKey}`, "")
      : null;

  return (
    <div
      aria-disabled={unqualified || undefined}
      className={
        "rounded-card border border-hairline bg-surface " + (unqualified ? "opacity-60" : "")
      }
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="type-body font-medium text-text-primary">{offer.name}</span>
          <span className="type-body text-text-primary tabular-nums">{price}</span>
        </div>
        {tagline ? <p className="mt-0.5 type-caption text-text-secondary">{tagline}</p> : null}
        {reasonText ? <p className="mt-2 type-caption text-destructive">{reasonText}</p> : null}
      </div>

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
          <p className="mt-2 type-caption text-text-secondary">{buyNote}</p>
        </div>
      ) : null}
    </div>
  );
}
