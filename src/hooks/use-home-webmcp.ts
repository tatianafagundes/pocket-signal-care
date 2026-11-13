import { useWebMCP } from "use-webmcp-tool";

import { formatPrice } from "@/lib/format";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import {
  balanceState,
  lineStatus,
  primaryDataBucket,
  primaryPlan,
  renewalWhen,
} from "@/services/customer360-rules";
import type { Customer360 } from "@/services/model";

/** Agent-facing summary of what the signed-in Home shows (balance, data left, plan, renewal). */
export function homeSummaryText(c360: Customer360): string {
  const balance = c360.balance;
  const state = balanceState(c360);
  const balanceLine =
    balance === null || state === "none"
      ? "Balance: none yet."
      : state === "expired"
        ? `Balance: ${formatPrice(balance.amountMinor, balance.currency, "en")}, expired.`
        : `Balance: ${formatPrice(balance.amountMinor, balance.currency, "en")}.`;
  const bucket = primaryDataBucket(c360);
  const dataLine = !bucket
    ? "Data: no allowance."
    : bucket.unlimited
      ? "Data: unlimited."
      : `Data left: ${bucket.remaining?.value ?? 0} of ${bucket.total?.value ?? 0} ${bucket.total?.unit ?? "GB"}.`;
  const plan = primaryPlan(c360);
  const when = renewalWhen(c360);
  const planLine = plan
    ? `Plan: ${plan.offer?.name ?? plan.name}${when ? `, renews on ${when.iso.slice(0, 10)}` : ""}.`
    : "Plan: none.";
  return [`Line: ${lineStatus(c360)}.`, balanceLine, dataLine, planLine].join("\n");
}

/** Registers the read-only Home summary tool while the signed-in Home has loaded data. */
export function useHomeWebMCP(c360: Customer360 | undefined) {
  useWebMCP({
    name: "get_home_summary",
    description:
      "Read what the Home screen shows for the signed-in customer: line status, balance, data left and plan renewal.",
    annotations: { readOnlyHint: true },
    enabled: c360 !== undefined,
    execute: () =>
      runWebMCPTool("get_home_summary", () => {
        if (!c360) throw new Error("Home is still loading.");
        return homeSummaryText(c360);
      }),
  });
}
