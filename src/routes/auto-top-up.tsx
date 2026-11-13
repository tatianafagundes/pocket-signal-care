import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Activity, Check, CreditCard, Repeat, Zap } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import type { Locale } from "@/lib/tenant-rules";
import type { AutoTopUpConfig, Balance } from "@/services/model";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { ResultHead, SummaryRow } from "@/components/result-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { shouldAutoTopUp } from "@/services/auto-top-up-rules";
import { runTopUp } from "@/lib/topup-payment";
import { tokenizeCardMock } from "@/lib/card-token";
import { formatPrice } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";

/** The demo saved method (read-only — same card the manual top-up + preferences mock use). */
const DEMO_CARD_NUMBER = "5555 5555 5555 7310";
const DEMO_METHOD_LABEL = "Mastercard •••• 7310";
/** Figma defaults: top up €20 when the balance falls below €15. */
const THRESHOLD_MINOR = 1500;
const AMOUNT_MINOR = 2000;

export const Route = createFileRoute("/auto-top-up")({
  head: () => ({
    meta: [
      { title: "Auto top-up — whitelabel" },
      {
        name: "description",
        content: "Set up automatic top-ups for your whitelabel prepaid balance.",
      },
      { property: "og:title", content: "Auto top-up — whitelabel" },
      {
        property: "og:description",
        content: "Set up automatic top-ups for your whitelabel prepaid balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/** Which step of the setup task is on screen. */
type Phase = "intro" | "review" | "result";

/** A completed first charge at opt-in, snapshotted for the receipt. */
interface FirstChargeData {
  balance: Balance;
  authorizationRef: string;
  chargedAt: string;
}

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant, locale } = useTenant();
  const customerId = useCurrentCustomerId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.customer360(tenant, customerId),
    queryFn: () => api.getCustomer360(customerId, tenant),
  });
  const configQuery = useQuery({
    queryKey: queryKeys.autoTopUp(tenant, customerId),
    queryFn: () => api.getAutoTopUp(customerId),
  });

  const [phase, setPhase] = useState<Phase>("intro");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [firstCharge, setFirstCharge] = useState<FirstChargeData | null>(null);

  // Focus the result heading when the first-charge receipt appears (WCAG 2.4.3).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === "result") headingRef.current?.focus();
  }, [phase]);

  const balance = query.data?.balance ?? null;
  const belowThreshold = balance !== null && balance.amountMinor < THRESHOLD_MINOR;
  const config = configQuery.data ?? null;
  // Show the on-state (P15) whenever auto top-up is enabled, unless we're mid-setup showing the
  // opt-in result (which already confirms the on-state in context).
  const showOnState = config?.enabled === true && phase !== "result";

  async function turnOff() {
    if (turningOff) return;
    setTurningOff(true);
    try {
      await api.disableAutoTopUp(customerId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.autoTopUp(tenant, customerId) });
      setSheetOpen(false);
      // Back to the off-state setup flow; a fresh opt-in starts at the intro.
      setPhase("intro");
      setConsent(false);
      setFirstCharge(null);
    } finally {
      setTurningOff(false);
    }
  }

  async function turnOn() {
    if (working || !consent) return;
    setWorking(true);
    try {
      // Persist the opt-in (enabled + consent stamp).
      await api.setAutoTopUp({
        customerId,
        thresholdMinor: THRESHOLD_MINOR,
        amountMinor: AMOUNT_MINOR,
      });
      // First charge at opt-in: if the balance is already below the threshold, the first top-up
      // runs now (Figma: "the first top-up happens as soon as you turn this on"). Same decision the
      // recurring trigger uses — evaluated against the config we just enabled.
      if (
        shouldAutoTopUp(
          {
            enabled: true,
            thresholdMinor: THRESHOLD_MINOR,
            amountMinor: AMOUNT_MINOR,
            method: {
              methodToken: tokenizeCardMock(DEMO_CARD_NUMBER),
              methodLabel: DEMO_METHOD_LABEL,
            },
          },
          balance,
        )
      ) {
        const result = await runTopUp({
          customerId,
          amountMinor: AMOUNT_MINOR,
          methodToken: tokenizeCardMock(DEMO_CARD_NUMBER),
          progress: { captured: false, credited: false },
          patch: () => {},
        });
        setFirstCharge({
          balance: result.balance,
          authorizationRef: result.authorizationRef,
          chargedAt: new Date().toISOString(),
        });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer360(tenant, customerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.autoTopUp(tenant, customerId) });
      setPhase("result");
    } catch {
      // A declined first charge leaves the opt-in persisted but no receipt; fall back to intro so
      // the user can retry. (The full failed-first-charge result is a later refinement.)
      setPhase("intro");
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageShell title={t("pages.autoTopUp.title", "Auto top-up")} flush>
      {query.isPending || configQuery.isPending ? (
        <div className="grid gap-3" aria-hidden="true">
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      ) : query.isError ? (
        <SeamErrorNotice
          error={asSeamFailure(query.error, "cpr.getCustomer360")}
          onRetry={() => void query.refetch()}
        />
      ) : configQuery.isError ? (
        <SeamErrorNotice
          error={asSeamFailure(configQuery.error, "preferences.getAutoTopUp")}
          onRetry={() => void configQuery.refetch()}
        />
      ) : showOnState && config ? (
        <OnStep locale={locale} config={config} onTurnOffRequest={() => setSheetOpen(true)} />
      ) : phase === "intro" ? (
        <IntroStep locale={locale} onSetUp={() => setPhase("review")} />
      ) : phase === "review" ? (
        <ReviewStep
          locale={locale}
          balance={balance}
          belowThreshold={belowThreshold}
          consent={consent}
          onConsentChange={setConsent}
          working={working}
          onTurnOn={() => void turnOn()}
        />
      ) : (
        <ResultStep locale={locale} firstCharge={firstCharge} headingRef={headingRef} />
      )}

      <TurnOffSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locale={locale}
        balance={balance}
        working={turningOff}
        onConfirm={() => void turnOff()}
      />
    </PageShell>
  );
}

/** A "how it would work" row: a tinted tile + a caption-above-label (sublabel-first). */
function InfoRow({
  icon,
  caption,
  value,
  divider = false,
}: {
  icon: React.ReactNode;
  caption: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[56px] items-center gap-3 p-3 ${divider ? "border-t border-hairline" : ""}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-tint">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-body-sm text-text-secondary">{caption}</span>
        <span className="mt-0.5 block type-body-sm-strong text-text-primary">{value}</span>
      </span>
    </div>
  );
}

/** P13 — auto top-up is off: how it would work + "nothing charged yet" + Set up. */
function IntroStep({ locale, onSetUp }: { locale: Locale; onSetUp: () => void }) {
  const { t } = useLocalizedTranslation();
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-tint">
          <Repeat className="size-5 text-text-secondary" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block type-body-sm-strong text-text-primary">
            {t("pages.autoTopUp.off.title", "Auto top-up is off")}
          </span>
          <span className="mt-1 block type-body-sm text-text-secondary">
            {t(
              "pages.autoTopUp.off.body",
              "Top up by hand each time, or let the app top up for you when your balance runs low.",
            )}
          </span>
        </span>
      </div>

      <section aria-labelledby="atu-how">
        <h2 id="atu-how" className="type-heading text-text-primary">
          {t("pages.autoTopUp.howTitle", "How it would work")}
        </h2>
        <div className="mt-2 overflow-hidden rounded-card border border-hairline bg-surface">
          <InfoRow
            icon={<Activity className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.whenCaption", "Tops up when")}
            value={t("pages.autoTopUp.row.whenValue", "Balance falls below {{amount}}", {
              amount: formatPrice(THRESHOLD_MINOR, "EUR", locale),
            })}
          />
          <InfoRow
            icon={<Zap className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.amountCaption", "Amount")}
            value={t("pages.autoTopUp.row.amountValue", "{{amount}} each time", {
              amount: formatPrice(AMOUNT_MINOR, "EUR", locale),
            })}
            divider
          />
          <InfoRow
            icon={<CreditCard className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.payCaption", "Pays with")}
            value={t("pages.autoTopUp.method.label", DEMO_METHOD_LABEL)}
            divider
          />
        </div>
      </section>

      <div className="rounded-card bg-surface-tint p-4">
        <p className="type-body-sm-strong text-text-primary">
          {t("pages.autoTopUp.notYet.title", "Nothing is charged yet.")}
        </p>
        <p className="mt-1 type-body-sm text-text-secondary">
          {t(
            "pages.autoTopUp.notYet.body",
            "You review the first top-up and give your consent on the next screen.",
          )}
        </p>
      </div>

      <Button className="w-full" onClick={onSetUp}>
        {t("pages.autoTopUp.setUp", "Set up auto top-up")}
      </Button>
    </div>
  );
}

interface ReviewStepProps {
  locale: Locale;
  balance: Balance | null;
  belowThreshold: boolean;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  working: boolean;
  onTurnOn: () => void;
}

/** P14 — review the terms, consent, turn on (first charge runs now if already below threshold). */
function ReviewStep({
  locale,
  balance,
  belowThreshold,
  consent,
  onConsentChange,
  working,
  onTurnOn,
}: ReviewStepProps) {
  const { t } = useLocalizedTranslation();
  const amount = formatPrice(AMOUNT_MINOR, "EUR", locale);
  const threshold = formatPrice(THRESHOLD_MINOR, "EUR", locale);

  return (
    <div className="grid gap-5">
      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        <SummaryRow
          label={t("pages.autoTopUp.review.firstTopUp", "First top-up")}
          value={
            belowThreshold
              ? t("pages.autoTopUp.review.firstNow", "{{amount}} · today", { amount })
              : t("pages.autoTopUp.review.firstNone", "Not now")
          }
        />
        <SummaryRow
          label={t("pages.autoTopUp.review.then", "Then")}
          value={t("pages.autoTopUp.review.thenValue", "{{amount}} when below {{threshold}}", {
            amount,
            threshold,
          })}
          divider
        />
        <SummaryRow
          label={t("pages.autoTopUp.review.paysWith", "Pays with")}
          value={t("pages.autoTopUp.method.label", DEMO_METHOD_LABEL)}
          divider
        />
        <SummaryRow
          label={t("pages.autoTopUp.review.fee", "Fee")}
          value={t("pages.autoTopUp.review.feeNone", "None")}
          divider
        />
      </div>

      {belowThreshold && balance ? (
        <p className="type-body-sm text-text-secondary">
          {t(
            "pages.autoTopUp.review.firstNowHint",
            "Your balance is {{balance}}, below {{threshold}}, so the first top-up happens as soon as you turn this on.",
            { balance: formatPrice(balance.amountMinor, balance.currency, locale), threshold },
          )}
        </p>
      ) : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="focus-ring mt-0.5 size-6 shrink-0 rounded-[6px] border-2 border-input accent-primary"
        />
        <span className="min-w-0 flex-1 type-body-sm text-text-primary">
          {t(
            "pages.autoTopUp.review.consent",
            "I authorize charging {{method}} {{amount}} each time my balance falls below {{threshold}}. I can turn this off at any time in Account › Auto top-up.",
            { method: t("pages.autoTopUp.method.label", DEMO_METHOD_LABEL), amount, threshold },
          )}
        </span>
      </label>

      <p className="type-body-sm text-text-secondary">
        {t(
          "pages.autoTopUp.review.notify",
          "We tell you by notification and SMS each time a top-up happens and if one fails.",
        )}
      </p>

      <Button
        className="w-full"
        onClick={onTurnOn}
        disabled={!consent || working}
        aria-busy={working}
      >
        {working
          ? t("pages.autoTopUp.review.turningOn", "Turning on…")
          : t("pages.autoTopUp.review.turnOn", "Turn on auto top-up")}
      </Button>
    </div>
  );
}

interface ResultStepProps {
  locale: Locale;
  firstCharge: FirstChargeData | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** The opt-in result: auto top-up is on, plus a receipt when a first charge ran at opt-in. */
function ResultStep({ locale, firstCharge, headingRef }: ResultStepProps) {
  const { t } = useLocalizedTranslation();
  const body = firstCharge
    ? t(
        "pages.autoTopUp.result.bodyCharged",
        "We topped up {{amount}} now, and we'll do it automatically when your balance runs low.",
        {
          amount: formatPrice(
            firstCharge.balance.amountMinor,
            firstCharge.balance.currency,
            locale,
          ),
        },
      )
    : t(
        "pages.autoTopUp.result.bodyArmed",
        "We'll top up automatically when your balance falls below {{threshold}}.",
        { threshold: formatPrice(THRESHOLD_MINOR, "EUR", locale) },
      );

  return (
    <div className="grid gap-5">
      <ResultHead
        tone="success"
        icon={<Check className="size-9 text-success" aria-hidden="true" />}
        title={t("pages.autoTopUp.result.title", "Auto top-up is on")}
        body={body}
        headingRef={headingRef}
      />

      {firstCharge ? (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <SummaryRow
            label={t("pages.autoTopUp.result.rowReference", "Reference")}
            value={firstCharge.authorizationRef}
          />
          <SummaryRow
            label={t("pages.autoTopUp.result.rowNewBalance", "New balance")}
            value={`${formatPrice(firstCharge.balance.amountMinor, firstCharge.balance.currency, locale)} · ${
              firstCharge.balance.validUntil
                ? formatShortDate(firstCharge.balance.validUntil, locale)
                : "—"
            }`}
            divider
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Button asChild className="w-full">
          <Link to="/">{t("pages.autoTopUp.result.backHome", "Back to Home")}</Link>
        </Button>
      </div>
    </div>
  );
}

/** A config row on the on-state: a tinted tile + caption-above-value (sublabel-first) + badge. */
function ConfigRow({
  icon,
  tileTone = "neutral",
  caption,
  value,
  badge,
  divider = false,
}: {
  icon: React.ReactNode;
  tileTone?: "neutral" | "success";
  caption: string;
  value: string;
  badge?: React.ReactNode;
  divider?: boolean;
}) {
  const tile = tileTone === "success" ? "bg-success-tint" : "bg-surface-tint";
  return (
    <div
      className={`flex min-h-[56px] items-center gap-3 p-3 ${divider ? "border-t border-hairline" : ""}`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-tile ${tile}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-body-sm text-text-secondary">{caption}</span>
        <span className="mt-0.5 block type-body-sm-strong text-text-primary">{value}</span>
      </span>
      {badge ?? null}
    </div>
  );
}

/** P15 — auto top-up is on: status + config + how we notify + turn off (opens the sheet). */
function OnStep({
  locale,
  config,
  onTurnOffRequest,
}: {
  locale: Locale;
  config: AutoTopUpConfig;
  onTurnOffRequest: () => void;
}) {
  const { t } = useLocalizedTranslation();
  const amount = formatPrice(config.amountMinor, "EUR", locale);
  const threshold = formatPrice(config.thresholdMinor, "EUR", locale);

  return (
    <div className="grid gap-4">
      {/* Status card — a single success row with an "On" badge. */}
      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        <ConfigRow
          icon={<Repeat className="size-5 text-success" aria-hidden="true" />}
          tileTone="success"
          caption={t("pages.autoTopUp.on.title", "Auto top-up is on")}
          value={t(
            "pages.autoTopUp.on.summary",
            "Tops up {{amount}} whenever your balance falls below {{threshold}}.",
            { amount, threshold },
          )}
          badge={
            <span className="shrink-0 rounded-pill bg-success-tint px-2 py-0.5 type-caption text-success">
              {t("pages.autoTopUp.on.badge", "On")}
            </span>
          }
        />
      </div>

      {/* Config card — the terms the backend actually holds (threshold, amount, method). */}
      <section aria-label={t("pages.autoTopUp.on.configLabel", "Your auto top-up settings")}>
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <ConfigRow
            icon={<Activity className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.whenCaption", "Tops up when")}
            value={t("pages.autoTopUp.on.whenValue", "Balance falls below {{threshold}}", {
              threshold,
            })}
          />
          <ConfigRow
            icon={<Zap className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.amountCaption", "Amount")}
            value={t("pages.autoTopUp.row.amountValue", "{{amount}} each time", { amount })}
            divider
          />
          <ConfigRow
            icon={<CreditCard className="size-5 text-text-secondary" aria-hidden="true" />}
            caption={t("pages.autoTopUp.row.payCaption", "Pays with")}
            value={config.method.methodLabel}
            divider
          />
        </div>
      </section>

      <p className="type-body-sm text-text-secondary">
        {t(
          "pages.autoTopUp.on.notify",
          "We tell you by notification and SMS each time a top-up happens and if one fails. Turn it off any time; you then top up by hand before the plan renews.",
        )}
      </p>

      {/* Destructive entry: secondary button with danger text (Figma button-secondary-danger). */}
      <Button
        variant="outline"
        className="w-full text-danger hover:text-danger"
        onClick={onTurnOffRequest}
      >
        {t("pages.autoTopUp.turnOff.cta", "Turn off auto top-up")}
      </Button>
    </div>
  );
}

interface TurnOffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  balance: Balance | null;
  working: boolean;
  onConfirm: () => void;
}

/** P15s — the turn-off confirmation bottom sheet (scrim + title + consequences + two buttons). */
function TurnOffSheet({
  open,
  onOpenChange,
  locale,
  balance,
  working,
  onConfirm,
}: TurnOffSheetProps) {
  const { t } = useLocalizedTranslation();
  // Only state the backend can back: the current balance and its validity. We deliberately do NOT
  // echo the Figma's plan-renewal date/price — the mock doesn't hold a renewal the UI can trust —
  // and keep that as generic copy instead (decisions/debt doc).
  const body =
    balance !== null
      ? t(
          "pages.autoTopUp.turnOff.bodyWithBalance",
          "Auto top-up stops. Your balance stays {{balance}}{{validity}}. You'll top up by hand before your plan renews. No fee, and you can turn it back on any time.",
          {
            balance: formatPrice(balance.amountMinor, balance.currency, locale),
            validity: balance.validUntil
              ? t("pages.autoTopUp.turnOff.validitySuffix", ", valid until {{date}}", {
                  date: formatShortDate(balance.validUntil, locale),
                })
              : "",
          },
        )
      : t(
          "pages.autoTopUp.turnOff.body",
          "Auto top-up stops. You'll top up by hand before your plan renews. No fee, and you can turn it back on any time.",
        );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="rounded-t-sheet border-0 bg-surface px-5 pb-[34px] pt-0 [&>div:first-child]:mt-3 [&>div:first-child]:h-1 [&>div:first-child]:w-9 [&>div:first-child]:bg-hairline">
        <div className="grid gap-3 pt-2">
          <DrawerTitle className="type-title text-text-primary">
            {t("pages.autoTopUp.turnOff.title", "Turn off auto top-up?")}
          </DrawerTitle>
          <DrawerDescription className="type-body text-text-secondary">{body}</DrawerDescription>
          <div className="mt-2 grid gap-2">
            <Button
              variant="destructive"
              className="w-full"
              onClick={onConfirm}
              disabled={working}
              aria-busy={working}
            >
              {working
                ? t("pages.autoTopUp.turnOff.working", "Turning off…")
                : t("pages.autoTopUp.turnOff.confirm", "Turn off auto top-up")}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full" disabled={working}>
                {t("pages.autoTopUp.turnOff.keep", "Keep it on")}
              </Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
