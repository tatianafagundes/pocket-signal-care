import { useWebMCP } from "use-webmcp-tool";

import { formatPrice } from "@/lib/format";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import type { Offer } from "@/services/model";

/** Compact agent-facing list of the plans shown in onboarding, marking the selected one. */
export function planListText(offers: Offer[], selectedOfferId: string | null): string {
  if (offers.length === 0) return "No plans are shown.";
  return offers
    .map((o) => {
      const cycle = o.validityDays ? ` every ${o.validityDays} days` : "";
      const mark = o.offerId === selectedOfferId ? " (selected)" : "";
      return `${o.offerId}: ${o.name}, ${o.dataAmount}, ${formatPrice(o.priceMinor, o.currency, "en")}${cycle}${o.euRoaming ? ", EU roaming" : ""}${mark}`;
    })
    .join("\n");
}

/**
 * Registers the onboarding plan-picker tools. `selectOffer` is the same action the radio group
 * uses, so a tool selection and a tap behave identically (including clearing an unsupported SIM).
 */
export function usePlanPickerWebMCP({
  offers,
  selectedOfferId,
  selectOffer,
}: {
  offers: Offer[] | undefined;
  selectedOfferId: string | null;
  selectOffer: (offerId: string) => void;
}) {
  useWebMCP({
    name: "list_plans",
    description:
      "List the prepaid plans shown on this onboarding step, with ids, data, price and which one is selected.",
    annotations: { readOnlyHint: true },
    enabled: offers !== undefined,
    execute: () =>
      runWebMCPTool("list_plans", () => {
        if (!offers) throw new Error("Plans are still loading.");
        return planListText(offers, selectedOfferId);
      }),
  });

  useWebMCP<{ offerId: unknown }, string>({
    name: "select_plan",
    description:
      "Select one of the shown plans by its id (from list_plans). It does not continue or pay.",
    inputSchema: {
      type: "object",
      properties: {
        offerId: { type: "string", description: "The plan id, for example drei-up." },
      },
      required: ["offerId"],
    },
    enabled: offers !== undefined,
    execute: ({ offerId }) =>
      runWebMCPTool("select_plan", () => {
        if (!offers) throw new Error("Plans are still loading.");
        if (typeof offerId !== "string") throw new Error("offerId must be a plan id string.");
        const offer = offers.find((o) => o.offerId === offerId);
        if (!offer) throw new Error("Unknown plan id; use one from list_plans.");
        selectOffer(offer.offerId);
        return `Selected ${offer.name}.`;
      }),
  });
}
