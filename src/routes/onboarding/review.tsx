import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { stepBefore, TENANT_OFFERS_ESIM } from "@/lib/onboarding-context";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useSession } from "@/hooks/use-session";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SelectableAddOn } from "@/components/onboarding/selectable-add-on";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { formatMsisdn, formatPrice, offerPriceLabel } from "@/lib/format";
import { runOnboardingSubmit, type SubmitStep } from "@/lib/onboarding-submit";
import { onboardingTodayTotal } from "@/lib/onboarding-total";
import { tokenizeCardMock } from "@/lib/card-token";

/*
 * Turn the (mock) entered card number into an opaque method token. In the real flow a PSP SDK
 * tokenizes the card in the browser and we only ever see the token (see lib/card-token).
 */

export const Route = createFileRoute("/onboarding/review")({
  head: () => ({
    meta: [
      { title: "Review and activate — whitelabel" },
      { name: "description", content: "Check your plan, number and account before you activate." },
      { property: "og:title", content: "Review and activate — whitelabel" },
      {
        property: "og:description",
        content: "Check your plan, number and account before you activate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const { state, patch } = useOnboarding();
  const { setSession } = useSession();
  const navigate = useNavigate();
  useSyncOnboardingStep("review");

  // The submit steps plus a "finalizing" phase (warming Customer 360 after the order completes).
  const [busyStep, setBusyStep] = useState<SubmitStep | "finalizing" | null>(null);
  const [terminalError, setTerminalError] = useState<SeamFailure | null>(null);

  // Mock payment block. The card number is tokenized to a method token on submit and is NEVER
  // persisted (same discipline as the password). A card decline is a FIELD error here, not a
  // terminal failure — the user can fix the card and place the order again.
  const [cardNumber, setCardNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [cardError, setCardError] = useState<SeamFailure | null>(null);

  // The summary is rebuilt from state at RENDER (B1): the offer is looked up fresh from the grid,
  // so changing the plan upstream can never leave a stale price/plan in the summary.
  const offersQuery = useQuery({
    queryKey: queryKeys.offers(tenant),
    queryFn: () => api.listOffers(tenant),
  });
  const offer = offersQuery.data?.find((o) => o.offerId === state.selectedOfferId);
  // Compute the price label once: calling offerPriceLabel twice could, under a concurrent locale
  // change between calls, mix a key from one locale with args from another.
  const priceLabel = offer ? offerPriceLabel(offer, locale) : null;
  const planPrice = priceLabel ? t(priceLabel.key, priceLabel.args) : "";

  // Add-on catalogue for the optional extras section.
  const addOnsQuery = useQuery({
    queryKey: queryKeys.addOnsOnboarding(tenant),
    queryFn: () => api.listAddOns(tenant),
  });
  // What is paid today: plan + ticked extras. Rebuilt at render from the catalogue (same B1 rule).
  const today = offer
    ? onboardingTodayTotal(offer, addOnsQuery.data, state.selectedAddOnIds)
    : null;

  function toggleAddOn(offerId: string, checked: boolean) {
    if (busy) return;
    const current = state.selectedAddOnIds;
    patch({
      selectedAddOnIds: checked ? [...current, offerId] : current.filter((id) => id !== offerId),
    });
  }

  const complete =
    state.selectedOfferId != null &&
    // The offer must RESOLVE from the catalog, not just be selected: the plan price (first top-up)
    // is read from it, so an unresolvable offer (deleted between plan and review) would otherwise
    // activate for €0. Gating on `offer` here disables Confirm until the price is known.
    offer != null &&
    // Every ticked extra must resolve too, or today's total would be understated.
    today != null &&
    !today.unresolved &&
    state.reservedMsisdn != null &&
    state.email != null &&
    state.givenName != null &&
    state.familyName != null &&
    // Payment: a card number must be entered and the authorization consent given.
    cardNumber.replace(/\D/g, "").length >= 12 &&
    consent;

  async function confirm() {
    setTerminalError(null);
    setCardError(null);
    try {
      // The plan price is the first top-up (same money, no separate amount step). Read fresh from
      // the looked-up offer so a plan change upstream can't leave a stale amount. The `complete`
      // guard already disables Place order when the offer is unresolvable; this is the money-boundary
      // backstop so a 0/absent price can NEVER reach authorize/topUp (silent €0 activation).
      if (!offer || !today || today.unresolved || offer.priceMinor <= 0) {
        throw new SeamFailure({
          code: "onboarding.review.priceUnavailable",
          category: "unknown",
          retryable: false,
          customerFacing: { key: "onboarding.review.terminalError" },
        });
      }
      const planPriceMinor = offer.priceMinor;
      // Tokenize the entered card (mock). The PAN never leaves this function — only the token is
      // passed on, and nothing card-related is persisted to state/localStorage.
      const methodToken = tokenizeCardMock(cardNumber);
      const customerId = await runOnboardingSubmit({
        state,
        patch,
        onStep: (step) => setBusyStep(step),
        planPriceMinor,
        extrasMinor: today.extrasMinor,
        methodToken,
      });
      // Auto-login: the activation created this customer, so start their session NOW — before the
      // onboarding reset on the success screen discards the wizard state. The session is a separate
      // store, so reset() still clears the wizard (the "don't resurrect a completed flow" invariant
      // holds) while the customer stays signed in. origin "mock" matches the mock auth driver.
      setSession({
        customerId,
        email: state.email ?? "",
        tenantId: tenant,
        givenName: state.givenName,
        origin: "mock",
      });
      // Orchestration announced each step (incl. submitOrder) already; now the finishing phase.
      setBusyStep("finalizing");
      // Warm the 360 so the success/my-plan screens have it; degrade-silent if it fails.
      await api.getCustomer360(customerId).catch(() => undefined);
      await navigate({ to: "/onboarding/success" });
    } catch (err) {
      if (err instanceof SeamFailure) {
        // A card decline is recoverable and about the CARD — show it at the card field so the user
        // fixes the card and places the order again, rather than the terminal "account saved" copy
        // (nothing was created: authorize runs first and failed). Everything else is terminal.
        if (err.code === "payment.cardDeclined") {
          setCardError(err);
        } else {
          setTerminalError(err);
        }
      } else {
        throw err;
      }
    } finally {
      setBusyStep(null);
    }
  }

  const busy = busyStep != null;

  return (
    <WizardPage
      step="review"
      title={t("onboarding.review.title", "Review and activate")}
      subtitle={t(
        "onboarding.review.subtitle",
        "Check everything before you confirm — you can still go back and change it.",
      )}
    >
      {/* Per-step progress announcement during submit (WCAG 4.1.3). */}
      <p className="sr-only" role="status">
        {busyStep ? t(`onboarding.review.progress.${busyStep}`, "Activating…") : ""}
      </p>

      {offersQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {terminalError ? (
            // Terminal activation failure: the account is saved. The notice is the MESSAGE only —
            // no retry button here, because the footer "Confirm and activate" is the single retry
            // path (both would call the same confirm(); two triggers for one action is ambiguous
            // in the most consequential state). `retryable: false` so SeamErrorNotice shows no
            // button; the copy ("you can try again") points at the footer.
            <SeamErrorNotice
              error={
                new SeamFailure({
                  code: terminalError.code,
                  category: "unknown",
                  retryable: false,
                  customerFacing: { key: "onboarding.review.terminalError" },
                })
              }
              className="mb-4"
            />
          ) : null}

          <dl className="grid gap-4">
            <SummaryRow
              label={t("onboarding.review.plan", "Plan")}
              value={offer ? `${offer.name} · ${planPrice}` : "—"}
              onChange={() => navigate({ to: "/onboarding/plan" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.number", "Number")}
              value={state.reservedMsisdn ? formatMsisdn(state.reservedMsisdn) : "—"}
              onChange={() => navigate({ to: "/onboarding/number" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.name", "Name")}
              value={[state.givenName, state.familyName].filter(Boolean).join(" ") || "—"}
              onChange={() => navigate({ to: "/onboarding/account" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
            <SummaryRow
              label={t("onboarding.review.account", "Account")}
              value={state.email ?? "—"}
              onChange={() => navigate({ to: "/onboarding/account" })}
              changeLabel={t("onboarding.review.change", "Change")}
              busy={busy}
            />
          </dl>

          {/* Optional extras: offered here, at the end, instead of as a separate step. */}
          {addOnsQuery.data && addOnsQuery.data.length > 0 ? (
            <section
              className="mt-6 border-t border-hairline pt-5"
              aria-labelledby="extras-heading"
            >
              <h2 id="extras-heading" className="type-title text-text-primary">
                {t("onboarding.review.extras.heading", "Add extras")}
              </h2>
              <p className="mt-1 type-caption text-text-secondary">
                {t(
                  "onboarding.review.extras.body",
                  "Optional — boost your plan now, or add them any time later.",
                )}
              </p>
              <ul
                className="mt-3 grid gap-3"
                aria-label={t("onboarding.addons.listLabel", "Available add-ons")}
              >
                {addOnsQuery.data.map((addOn) => (
                  <li key={addOn.offerId}>
                    <SelectableAddOn
                      offer={addOn}
                      checked={state.selectedAddOnIds.includes(addOn.offerId)}
                      onToggle={(checked) => toggleAddOn(addOn.offerId, checked)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Payment block. Each money line declares its nature; the total comes from the pure
              onboardingTodayTotal rule (plan + ticked extras). "Authorized today" is a reservation,
              not a charge. */}
          <section className="mt-6 border-t border-hairline pt-5" aria-labelledby="pay-heading">
            <h2 id="pay-heading" className="type-title text-text-primary">
              {t("onboarding.review.payment.heading", "Payment")}
            </h2>

            <dl className="mt-3 grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="type-body text-text-secondary">
                  {t("onboarding.review.payment.firstTopUp", "Plan · first top-up")}
                </dt>
                <dd className="type-body text-text-primary tabular-nums">
                  {offer ? formatPrice(offer.priceMinor, offer.currency, locale) : "—"}
                </dd>
              </div>
              {today?.extras.map((extra) => (
                <div key={extra.offerId} className="flex items-baseline justify-between gap-2">
                  <dt className="type-body text-text-secondary">
                    {t("onboarding.review.payment.extraLine", "Extra · {{name}}", {
                      name: extra.name,
                    })}
                  </dt>
                  <dd className="type-body text-text-primary tabular-nums">
                    {formatPrice(extra.priceMinor, extra.currency, locale)}
                  </dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2 border-t border-hairline pt-2">
                <dt className="type-body font-medium text-text-primary">
                  {t("onboarding.review.payment.authorizedToday", "Authorized today")}
                </dt>
                <dd className="type-body font-medium text-text-primary tabular-nums">
                  {offer && today ? formatPrice(today.totalMinor, offer.currency, locale) : "—"}
                </dd>
              </div>
            </dl>

            <p className="mt-2 type-caption text-text-secondary">
              {t(
                "onboarding.review.payment.authorizeNote",
                "Your plan price becomes your first balance, and extras switch on with your plan. We only charge your card when your plan is ready.",
              )}
            </p>

            <div className="mt-4 grid gap-2">
              <Label htmlFor="card-number">
                {t("onboarding.review.payment.cardLabel", "Card number")}
              </Label>
              <Input
                id="card-number"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={cardNumber}
                onChange={(e) => {
                  setCardNumber(e.target.value);
                  if (cardError) setCardError(null);
                }}
                aria-describedby={cardError ? "card-error" : undefined}
                aria-invalid={cardError != null}
                disabled={busy}
              />
              {/* Card decline = field-level, recoverable (no retry button; fixing the card is the
                  retry). Lives next to the input it's about. */}
              {cardError ? (
                <div id="card-error">
                  <SeamErrorNotice error={cardError} />
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-start gap-3">
              <Checkbox
                id="pay-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <Label htmlFor="pay-consent" className="type-caption text-text-secondary font-normal">
                {t(
                  "onboarding.review.payment.consent",
                  "I authorize today's payment for my plan and any extras I've added.",
                )}
              </Label>
            </div>
          </section>

          {!complete ? (
            // Not role="alert": announcing "incomplete" assertively while the user is still typing
            // the card is noise. The disabled Place-order button's hint is the single signal.
            <p className="mt-4 type-caption text-destructive">
              {t(
                "onboarding.review.incomplete",
                "Enter your card and authorize the payment to place your order.",
              )}
            </p>
          ) : null}

          <WizardNav
            onBack={() =>
              navigate({
                to: `/onboarding/${stepBefore("review", { offersEsim: TENANT_OFFERS_ESIM, simType: state.simType })}`,
              })
            }
            onContinue={() => void confirm()}
            continueLabel={t("onboarding.review.placeOrder", "Place order")}
            continueDisabled={!complete}
            busy={busy}
          />
        </>
      )}
    </WizardPage>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  onChange: () => void;
  changeLabel: string;
  busy: boolean;
}

function SummaryRow({ label, value, onChange, changeLabel, busy }: SummaryRowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="type-caption text-text-secondary">{label}</dt>
        <dd className="type-body text-text-primary">{value}</dd>
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        // accent-ink (#0073a0, >=4.5:1), not the shadcn link variant's text-primary (the bright
        // cyan #0096c5 ~3.3:1, which fails 1.4.3 for text and is outside the A1 button exception).
        className="min-h-11 text-accent-ink"
        onClick={onChange}
        disabled={busy}
      >
        {changeLabel}
      </Button>
    </div>
  );
}
