import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, ChevronDown, ChevronRight, Wallet } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { StatusDot, type StatusTone } from "@/components/status/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { api, asSeamFailure } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { lineStatus, type LineStatus } from "@/services/customer360-rules";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — whitelabel" },
      { name: "description", content: "Support in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Support — whitelabel" },
      {
        property: "og:description",
        content: "Support in your whitelabel prepaid mobile self-care app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/** The service-status tone per line state — colour half of "colour + word". */
const STATUS_TONE: Record<LineStatus, StatusTone> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
};

/** Help topics — self-service first (market pattern). Copy is from the Figma P12 help list. */
const HELP_TOPICS = [
  {
    id: "topup-not-credited",
    qKey: "pages.support.topics.topupNotCredited.q",
    q: "My top-up was not credited",
    aKey: "pages.support.topics.topupNotCredited.a",
    a: "Card top-ups show within 30 minutes; if not, chat with us. Refunds take up to 5 business days.",
  },
  {
    id: "balance-validity",
    qKey: "pages.support.topics.balanceValidity.q",
    q: "Balance and validity",
    aKey: "pages.support.topics.balanceValidity.a",
    a: "What expires when, and how a top-up extends it.",
  },
  {
    id: "plans-addons",
    qKey: "pages.support.topics.plansAddons.q",
    q: "Plans & add-ons",
    aKey: "pages.support.topics.plansAddons.a",
    a: "What’s included and how add-ons are paid.",
  },
] as const;

function Page() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const customerId = useCurrentCustomerId();

  const query = useQuery({
    queryKey: queryKeys.customer360(tenant, customerId),
    queryFn: () => api.getCustomer360(customerId, tenant),
  });

  return (
    <PageShell title={t("pages.support.title", "Support")} flush>
      {/* Service status — informative only. It reflects the line state honestly; it does NOT link
          to a Service status screen (that screen doesn't exist yet), so it carries no chevron. */}
      {query.isPending ? (
        <Skeleton className="h-12 w-full rounded-card" aria-hidden="true" />
      ) : query.isError ? null : (
        <ServiceStrip status={lineStatus(query.data)} />
      )}

      {/* Quick actions — only the ones with a real destination (self-service shortcuts). Report an
          issue and Track a top-up are omitted until those screens exist (no dead links). */}
      <section aria-labelledby="support-actions" className="mt-5">
        <h2 id="support-actions" className="sr-only">
          {t("pages.support.actionsLabel", "Quick actions")}
        </h2>
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <ActionRow
            to="/"
            icon={<Activity className="size-5 text-accent-ink" aria-hidden="true" />}
            label={t("pages.support.actions.checkBalance", "Check balance")}
            sublabel={t("pages.support.actions.checkBalanceSub", "See your balance and validity")}
          />
          <ActionRow
            to="/top-up"
            icon={<Wallet className="size-5 text-accent-ink" aria-hidden="true" />}
            label={t("pages.support.actions.topUp", "Top up")}
            sublabel={t("pages.support.actions.topUpSub", "Add credit to your balance")}
            divider
          />
        </div>
      </section>

      {/* Help topics — expand inline (market pattern; no extra screens to maintain). */}
      <section aria-labelledby="support-topics" className="mt-6">
        <h2 id="support-topics" className="type-heading text-text-primary">
          {t("pages.support.topicsTitle", "Help topics")}
        </h2>
        <div className="mt-2 overflow-hidden rounded-card border border-hairline bg-surface">
          {HELP_TOPICS.map((topic, i) => (
            <HelpTopic
              key={topic.id}
              question={t(topic.qKey, topic.q)}
              answer={t(topic.aKey, topic.a)}
              divider={i > 0}
            />
          ))}
        </div>
      </section>
    </PageShell>
  );
}

/** The one-line service-status row: a status dot + a sentence + the line it refers to. */
function ServiceStrip({ status }: { status: LineStatus }) {
  const { t } = useLocalizedTranslation();
  const sentence =
    status === "suspended"
      ? t("pages.support.status.suspended", "Mobile service suspended")
      : status === "pending"
        ? t("pages.support.status.pending", "Mobile service activating")
        : t("pages.support.status.online", "All services online");
  return (
    <div className="flex items-center gap-2 rounded-card border border-hairline bg-surface px-4 py-3">
      <StatusDot tone={STATUS_TONE[status]} />
      <span className="type-body-sm-strong text-text-primary">{sentence}</span>
      <span className="type-body-sm text-text-secondary">
        {t("pages.support.status.service", "Mobile")}
      </span>
    </div>
  );
}

/** A quick-action row: icon tile + label/sublabel + chevron, the whole row a link. */
function ActionRow({
  to,
  icon,
  label,
  sublabel,
  divider = false,
}: {
  to: "/" | "/top-up";
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  divider?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`focus-ring flex min-h-[64px] items-center gap-3 p-3 hover:bg-surface-tint ${
        divider ? "border-t border-hairline" : ""
      }`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent-tint">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block type-body-sm-strong text-text-primary">{label}</span>
        <span className="mt-0.5 block type-caption text-text-secondary">{sublabel}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
    </Link>
  );
}

/** An inline-expanding help topic: an accessible disclosure button + its answer region. */
function HelpTopic({
  question,
  answer,
  divider,
}: {
  question: string;
  answer: string;
  divider: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={divider ? "border-t border-hairline" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex min-h-[56px] w-full items-center gap-3 p-3 text-left"
      >
        <span className="min-w-0 flex-1 type-body-sm-strong text-text-primary">{question}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-text-secondary transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open ? <p className="px-3 pb-3 type-body-sm text-text-secondary">{answer}</p> : null}
    </div>
  );
}
