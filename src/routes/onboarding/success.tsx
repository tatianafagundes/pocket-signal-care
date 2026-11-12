import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/services/api";
import type { SimChoice } from "@/services/model";

export const Route = createFileRoute("/onboarding/success")({
  head: () => ({
    meta: [
      { title: "You're all set — whitelabel" },
      { name: "description", content: "Your prepaid plan is active. Welcome aboard." },
      { property: "og:title", content: "You're all set — whitelabel" },
      { property: "og:description", content: "Your prepaid plan is active. Welcome aboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuccessPage,
});

/*
 * /onboarding/success — the activation is done. (Fase 7.5)
 *
 * TWO things make this screen honest:
 *
 * 1. MONEY AS A MILESTONE TIMELINE (design-review B1). The three money moments do NOT all happen
 *    "today". Only the authorization happened now; the charge happens at the fulfilment milestone
 *    (SIM shipped / eSIM ready), and the balance is added when the line goes active. So we show a
 *    timeline — "Authorized ✓" (done) · "Charged when your SIM ships / eSIM is ready" (upcoming) ·
 *    "Added when your line is active" (upcoming) — never three "today" stamps that would imply an
 *    immediate triple event.
 *
 * 2. eSIM INSTALL STATES (design-review B4). For an eSIM flow we read the profile and render its
 *    state: ready (activation code + QR-able string + the three install paths), requested (still
 *    preparing), failed, or expired.
 *
 * reset() clears the wizard on mount (so a completed flow can't resurrect). Anything we want to
 * SHOW must be snapshotted via a lazy useState initialiser BEFORE that effect runs.
 */

interface SuccessSnapshot {
  name: string;
  simType: SimChoice | null;
  esimProfileId: string | null;
}

function SuccessPage() {
  const { t } = useLocalizedTranslation();
  const { state, reset } = useOnboarding();
  useSyncOnboardingStep("success");

  // Snapshot everything we render BEFORE reset() clears state. Lazy init runs once, pre-reset.
  const [snapshot] = useState<SuccessSnapshot>(() => ({
    name: state.givenName ?? "",
    simType: state.simType,
    esimProfileId: state.esimProfileId,
  }));

  // The flow is done: clear the wizard so a refresh/back doesn't resurrect a completed onboarding.
  useEffect(() => {
    reset();
    // reset is stable (useCallback); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = snapshot.name
    ? t("onboarding.success.title", "You're all set, {{name}}", { name: snapshot.name })
    : t("onboarding.success.titleNoName", "You're all set");

  return (
    <WizardPage
      step="success"
      title={title}
      subtitle={t("onboarding.success.subtitle", "Your plan is active.")}
    >
      {snapshot.simType === "esim" ? <EsimSection esimProfileId={snapshot.esimProfileId} /> : null}

      <MoneyTimeline simType={snapshot.simType} />

      <Button asChild className="mt-6 w-full min-h-11">
        <Link to="/top-up">{t("onboarding.success.topUp", "Top up now")}</Link>
      </Button>
      <Button asChild variant="ghost" className="mt-2 w-full min-h-11">
        <Link to="/my-plan">{t("onboarding.success.later", "Maybe later")}</Link>
      </Button>
    </WizardPage>
  );
}

/*
 * The money milestone timeline. Authorized is DONE (✓); charged and added are UPCOMING, described
 * by WHEN they happen — never a "today" stamp. The "charged" copy depends on the SIM form (ships
 * vs eSIM ready).
 */
function MoneyTimeline({ simType }: { simType: SimChoice | null }) {
  const { t } = useLocalizedTranslation();

  const chargedWhen =
    simType === "esim"
      ? t("onboarding.success.money.chargedEsim", "Charged when your eSIM is ready")
      : t("onboarding.success.money.chargedPhysical", "Charged when your SIM ships");

  return (
    <section
      className="mt-2 rounded-card border border-hairline bg-surface p-4"
      aria-labelledby="money-heading"
    >
      <h2 id="money-heading" className="type-title text-text-primary">
        {t("onboarding.success.money.heading", "Your first top-up")}
      </h2>
      <ol className="mt-3 grid gap-3">
        <TimelineRow
          done
          stateLabel={t("onboarding.success.money.stateDone", "Done")}
          label={t("onboarding.success.money.authorized", "Authorized")}
          detail={t(
            "onboarding.success.money.authorizedDetail",
            "We've reserved your first top-up.",
          )}
        />
        <TimelineRow
          stateLabel={t("onboarding.success.money.stateUpcoming", "Upcoming")}
          label={chargedWhen}
          detail={t("onboarding.success.money.chargedDetail", "You're not charged until then.")}
        />
        <TimelineRow
          stateLabel={t("onboarding.success.money.stateUpcoming", "Upcoming")}
          label={t("onboarding.success.money.added", "Added when your line is active")}
          detail={t(
            "onboarding.success.money.addedDetail",
            "Your first top-up becomes your balance.",
          )}
        />
      </ol>
    </section>
  );
}

function TimelineRow({
  done,
  stateLabel,
  label,
  detail,
}: {
  done?: boolean;
  stateLabel: string;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " +
          (done
            ? "border-accent-ink bg-accent-ink text-white"
            : "border-hairline text-text-secondary")
        }
      >
        {done ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0">
        {/* State conveyed to AT in words, not by the (aria-hidden) check/colour alone — WCAG 1.3.1/1.4.1. */}
        <span className="sr-only">{stateLabel}: </span>
        <span className="type-body text-text-primary">{label}</span>
        <span className="mt-0.5 block type-caption text-text-secondary">{detail}</span>
      </span>
    </li>
  );
}

/*
 * eSIM install section — four states (design-review B4). Reads the profile by the snapshotted id.
 */
function EsimSection({ esimProfileId }: { esimProfileId: string | null }) {
  const { t } = useLocalizedTranslation();

  const profileQuery = useQuery({
    queryKey: ["esim-profile", esimProfileId],
    queryFn: () => api.getEsimProfile(esimProfileId as string),
    enabled: esimProfileId != null,
  });

  // No id at all (shouldn't happen for an eSIM flow, but be honest if it does).
  if (esimProfileId == null) {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.requested",
            "Your eSIM is being prepared — we'll email the install details shortly.",
          )}
        </p>
      </EsimShell>
    );
  }

  if (profileQuery.isPending) {
    return (
      <EsimShell>
        <Skeleton className="h-24 w-full" />
      </EsimShell>
    );
  }

  // A read failure or a failed/expired profile: say so plainly, with the next step.
  if (profileQuery.isError) {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.failed",
            "We couldn't load your eSIM yet. Check My plan in a moment, or contact support.",
          )}
        </p>
      </EsimShell>
    );
  }

  const profile = profileQuery.data;
  const lifecycle = profile.state ?? profile.status;

  if (lifecycle === "failed") {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.failed",
            "We couldn't load your eSIM yet. Check My plan in a moment, or contact support.",
          )}
        </p>
      </EsimShell>
    );
  }

  if (lifecycle === "expired") {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.expired",
            "This eSIM install window expired. Contact support to re-issue your eSIM.",
          )}
        </p>
      </EsimShell>
    );
  }

  if (lifecycle === "requested") {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.requested",
            "Your eSIM is being prepared — we'll email the install details shortly.",
          )}
        </p>
      </EsimShell>
    );
  }

  // A deleted profile is a dead end here (the mock never returns it at this point, but be honest if
  // a real SM-DP+ ever does): treat it like a failure — contact support, don't offer install steps.
  if (lifecycle === "deleted") {
    return (
      <EsimShell>
        <p className="type-body text-text-secondary">
          {t(
            "onboarding.success.esim.failed",
            "We couldn't load your eSIM yet. Check My plan in a moment, or contact support.",
          )}
        </p>
      </EsimShell>
    );
  }

  // ready (also downloaded/installed): show ONLY the install paths the screen actually delivers —
  // a tappable install link (when the profile has one) and the manual activation code. No QR is
  // rendered, so no QR is promised (we don't ship a QR component in this mock).
  return (
    <EsimShell>
      <p className="type-body text-text-secondary">
        {t(
          "onboarding.success.esim.readyIntro",
          "Install your eSIM on this device. Choose whichever is easiest:",
        )}
      </p>
      <ul className="mt-3 grid gap-2">
        {profile.installUrl ? (
          <li className="type-caption text-text-primary">
            {t("onboarding.success.esim.pathLink", "On this phone, tap to install:")}{" "}
            <a href={profile.installUrl} className="focus-ring break-all text-accent-ink underline">
              {t("onboarding.success.esim.pathLinkCta", "Install eSIM")}
            </a>
          </li>
        ) : null}
        <li className="type-caption text-text-primary">
          {t(
            "onboarding.success.esim.pathManual",
            "Or enter the activation code below in your phone's eSIM settings.",
          )}
        </li>
      </ul>
      <div className="mt-3">
        <p className="type-caption text-text-secondary">
          {t("onboarding.success.esim.codeLabel", "Activation code")}
        </p>
        {/* The code is critical text the user transcribes char-by-char, so it must be the most
            legible thing here: text-primary on the tint, NOT accent on accent-tint (DESIGN.md:
            "text on accent-tint is text-primary, never accent"). */}
        <code className="mt-1 block break-all rounded-card bg-accent-tint px-3 py-2 type-caption text-text-primary">
          {profile.activationCode}
        </code>
      </div>
    </EsimShell>
  );
}

function EsimShell({ children }: { children: React.ReactNode }) {
  const { t } = useLocalizedTranslation();
  return (
    <section
      className="mb-4 rounded-card border border-hairline bg-surface p-4"
      aria-labelledby="esim-heading"
    >
      <h2 id="esim-heading" className="type-title text-text-primary">
        {t("onboarding.success.esim.heading", "Your eSIM")}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
