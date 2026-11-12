import { useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Offer } from "@/services/model";
import type { QualifyResult } from "@/services/catalog-rules";

/*
 * AddOnCard (Fuon). One add-on on the add-ons route. (Spec Fase 5 / Req 2, 8 · buy: Fase 6)
 *
 * Browse-and-buy card (not a radio — add-ons aren't a single-choice grid like the plan step). It
 * shows the name, the localized "good for…" tagline, the price, an expand-in-place "More info"
 * with the long description, and a Buy action. It renders the TMF679 qualification tri-state for an
 * EXISTING customer: when the add-on costs more than the balance, qualify is "unqualified", the
 * reason is shown (not colour-only), the card is dimmed/aria-disabled, and Buy is disabled.
 *
 * Buy is presentational here: the parent (the route) owns the mutation and passes a handler plus
 * the per-card status. On success the button is replaced by an "Added" confirmation (role=status)
 * — buying provisions the add-on into the installed base, so it's now owned; on error an inline
 * message with a retry sits next to the button (matching the repo's inline-error pattern). The
 * result stays beside the control that triggered it (no toast), which is simpler and more
 * accessible for a persistent outcome.
 */

export type BuyStatus = "idle" | "busy" | "success" | "error";

interface AddOnCardProps {
  offer: Offer;
  /** Qualification for the current customer; undefined while it loads. */
  qualify?: QualifyResult;
  /** Buy the add-on. Omitted makes the card browse-only (no Buy button). */
  onBuy?: (offerId: string) => void;
  /** Per-card buy status, driven by the parent mutation. */
  buyStatus?: BuyStatus;
  /** True while ANY card's purchase is in flight — disables this Buy to prevent a concurrent
   *  second purchase (which would misattribute the first request's result to the wrong card). */
  anyBusy?: boolean;
}

export function AddOnCard({
  offer,
  qualify,
  onBuy,
  buyStatus = "idle",
  anyBusy = false,
}: AddOnCardProps) {
  const { t } = useLocalizedTranslation();
  const { locale } = useTenant();
  const [open, setOpen] = useState(false);

  const unqualified = qualify?.result === "unqualified";
  const price = formatPrice(offer.priceMinor, offer.currency, locale);
  const detailId = `addon-${offer.offerId}-detail`;
  const errorId = `addon-${offer.offerId}-error`;

  const tagline = offer.tagline ?? t(`pages.addOns.offers.${offer.offerId}.tagline`, "");
  const description =
    offer.description ?? t(`pages.addOns.offers.${offer.offerId}.description`, "");
  const reasonText =
    unqualified && qualify?.reasonKey
      ? t(`pages.addOns.ineligible.${qualify.reasonKey}`, "")
      : null;

  const busy = buyStatus === "busy";
  const bought = buyStatus === "success";

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

        {onBuy ? (
          <div className="mt-3">
            {/*
              On success we keep the button MOUNTED and switch it to a disabled "Added" state,
              rather than swapping it for a <p>. Unmounting the focused button would orphan
              keyboard/SR focus (WCAG 2.4.3); a disabled button preserves the element, keeps the
              card's visual weight, and is correctly non-actionable. aria-live announces the change.
            */}
            <Button
              type="button"
              onClick={() => onBuy(offer.offerId)}
              disabled={unqualified || busy || bought || (anyBusy && !bought)}
              aria-busy={busy || undefined}
              aria-live="polite"
              aria-describedby={buyStatus === "error" ? errorId : undefined}
              className="min-h-11 w-full"
            >
              {bought ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("pages.addOns.buy.added", "Added to your plan")}
                </>
              ) : busy ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {t("pages.addOns.buy.busy", "Adding…")}
                </>
              ) : (
                t("pages.addOns.buy.cta", "Add to my plan")
              )}
            </Button>
            {buyStatus === "error" ? (
              <p id={errorId} role="alert" className="mt-2 type-caption text-destructive">
                {t("pages.addOns.buy.error", "Couldn't add this add-on. Please try again.")}
              </p>
            ) : null}
          </div>
        ) : null}
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
        </div>
      ) : null}
    </div>
  );
}
