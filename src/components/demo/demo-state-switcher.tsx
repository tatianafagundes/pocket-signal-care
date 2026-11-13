import { useQueryClient } from "@tanstack/react-query";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useSession } from "@/hooks/use-session";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { queryKeys } from "@/lib/query-keys";
import {
  DEMO_VARIANTS,
  demoCustomerId,
  demoVariantOf,
  type DemoVariant,
} from "@/services/demo-variants";

/*
 * Demo state switcher — a DEV-ONLY tool to preview the Customer 360 line states (healthy,
 * suspended, unlimited, expired, empty, pending) without real data or a customer picker. It swaps
 * the signed-in session's customerId to the seeded demo-<tenant>-<variant> line and refetches the
 * 360. It renders only when signed in AND in a dev build, so it never ships in a real app — the
 * states are mock fixtures, not a product feature. A real IdP (Fase 8) removes the need entirely.
 */

export function DemoStateSwitcher() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { session, setSession } = useSession();
  const queryClient = useQueryClient();
  const currentId = useCurrentCustomerId();

  // Dev-only, and only meaningful when signed in (the switcher edits the session's customerId).
  if (!import.meta.env.DEV || !session) return null;

  const current = demoVariantOf(currentId) ?? "healthy";

  const select = (variant: DemoVariant) => {
    if (variant === current) return;
    setSession({ ...session, customerId: demoCustomerId(tenant, variant) });
    // The 360 is cached per customerId; drop it so the new line's data loads.
    void queryClient.invalidateQueries({ queryKey: queryKeys.customer360All() });
  };

  const label = (v: DemoVariant): string => t(`pages.account.demo.variant.${v}`, DEFAULT_LABELS[v]);

  return (
    <section
      aria-labelledby="demo-switcher-title"
      className="rounded-card border border-dashed border-hairline bg-surface p-4"
    >
      <h2 id="demo-switcher-title" className="type-caption text-text-secondary">
        {t("pages.account.demo.title", "Demo: line state")}
      </h2>
      <p className="mt-1 type-body-sm text-text-secondary">
        {t(
          "pages.account.demo.body",
          "Preview how the Home and My plan screens look in each state.",
        )}
      </p>
      <div
        role="radiogroup"
        aria-label={t("pages.account.demo.title", "Demo: line state")}
        className="mt-3 flex flex-wrap gap-2"
      >
        {DEMO_VARIANTS.map((v) => {
          const selected = v === current;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(v)}
              className={`focus-ring min-h-9 rounded-pill border px-3 py-1 type-body-sm-strong ${
                selected
                  ? "border-transparent bg-accent-tint text-accent-ink"
                  : "border-hairline bg-surface text-text-primary"
              }`}
            >
              {label(v)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** English defaults; the locale JSON carries the shipped copy for both locales. */
const DEFAULT_LABELS: Record<DemoVariant, string> = {
  healthy: "Healthy",
  suspended: "Suspended",
  unlimited: "Unlimited data",
  expired: "Expired balance",
  empty: "Empty balance",
  pending: "Pending line",
};
