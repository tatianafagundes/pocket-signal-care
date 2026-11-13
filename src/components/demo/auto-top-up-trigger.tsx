import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useCurrentCustomerId } from "@/lib/current-customer";
import { queryKeys } from "@/lib/query-keys";
import { shouldAutoTopUp } from "@/services/auto-top-up-rules";
import { runTopUp } from "@/lib/topup-payment";
import { tokenizeCardMock } from "@/lib/card-token";
import { formatPrice } from "@/lib/format";
import type { AutoTopUpConfig, Balance } from "@/services/model";
import type { Locale } from "@/lib/tenant-rules";

/*
 * DEV-ONLY demo control that simulates the recurring auto top-up trigger.
 *
 * There is no scheduler in the mock (a real one is Fase 8 debt), so the recurring charge can't fire
 * on its own. This button stands in for that clock: it runs the SAME pure rule the real trigger
 * would (shouldAutoTopUp against the current balance) and, when the rule says yes, the SAME
 * runTopUp the manual flow and the opt-in first charge use. Nothing here is faked — it only forces
 * the evaluation to happen now. It renders only in a dev build, so it never ships.
 *
 * To see it fire, drop the balance below the threshold first (Account › Demo: line state › Empty
 * balance). At the seeded healthy balance (= threshold) the rule correctly declines.
 */
export function AutoTopUpTrigger({
  config,
  balance,
  locale,
}: {
  config: AutoTopUpConfig;
  balance: Balance | null;
  locale: Locale;
}) {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const customerId = useCurrentCustomerId();
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);

  if (!import.meta.env.DEV) return null;

  const run = async () => {
    if (working) return;
    if (!shouldAutoTopUp(config, balance)) {
      toast.info(
        t(
          "pages.autoTopUp.demo.notNeeded",
          "Balance is at or above {{threshold}} — nothing to do.",
          {
            threshold: formatPrice(config.thresholdMinor, "EUR", locale),
          },
        ),
      );
      return;
    }
    setWorking(true);
    try {
      const result = await runTopUp({
        customerId,
        amountMinor: config.amountMinor,
        methodToken: tokenizeCardMock("5555 5555 5555 7310"),
        progress: { captured: false, credited: false },
        patch: () => {},
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.customer360(tenant, customerId) });
      toast.success(
        t(
          "pages.autoTopUp.demo.fired",
          "Auto top-up fired — {{amount}} added. New balance {{balance}}.",
          {
            amount: formatPrice(config.amountMinor, "EUR", locale),
            balance: formatPrice(result.balance.amountMinor, result.balance.currency, locale),
          },
        ),
      );
    } catch {
      toast.error(t("pages.autoTopUp.demo.failed", "The simulated charge failed. Try again."));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section
      aria-labelledby="atu-demo-title"
      className="rounded-card border border-dashed border-hairline bg-surface p-4"
    >
      <h2 id="atu-demo-title" className="type-caption text-text-secondary">
        {t("pages.autoTopUp.demo.title", "Demo: trigger")}
      </h2>
      <p className="mt-1 type-body-sm text-text-secondary">
        {t(
          "pages.autoTopUp.demo.body",
          "No scheduler runs in the demo. Fire the recurring check now — it tops up only if your balance is below the threshold.",
        )}
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={working}
        aria-busy={working}
        className="focus-ring mt-3 min-h-9 rounded-pill border border-hairline bg-surface px-3 py-1 type-body-sm-strong text-text-primary disabled:opacity-50"
      >
        {working
          ? t("pages.autoTopUp.demo.running", "Running…")
          : t("pages.autoTopUp.demo.run", "Run auto top-up check")}
      </button>
    </section>
  );
}
