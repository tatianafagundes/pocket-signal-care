import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { formatPrice } from "@/lib/format";
import { brandName, brandSchema, loadPlans, toOfferJson } from "@/lib/mcp/catalog";
import { recommend, type ReasonCode } from "@/services/recommendation-rules";

const REASONS: Record<ReasonCode, string> = {
  "assist.reason.fits": "Its data comfortably covers the estimated monthly use.",
  "assist.reason.closeFit": "Its data covers the estimate, but only just — extra data may help in busy months.",
  "assist.reason.unlimited": "Only an unlimited plan covers this much use.",
  "assist.reason.biggest": "No plan fully covers the estimate, so this is the largest allowance.",
  "assist.reason.default": "This is the brand's most popular plan.",
};

export default defineTool({
  name: "suggest_plan",
  title: "Suggest a plan",
  description:
    "Suggest one prepaid plan from four everyday usage answers, using the same rules as the app's \"Help me choose\".",
  inputSchema: {
    brand: brandSchema,
    video: z
      .enum(["rarely", "daily", "hours"])
      .describe("Video watched on mobile data: rarely, about 30 minutes daily, or hours a day."),
    social: z
      .enum(["messages", "some", "lots"])
      .describe("Social media and music away from Wi-Fi: mostly messages, some, or lots."),
    hotspot: z
      .enum(["never", "sometimes", "often"])
      .describe("How often the phone's internet is shared with a laptop or tablet."),
    travelsEu: z.boolean().describe("True when the phone will be used in other EU countries."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ brand, video, social, hotspot, travelsEu }) => {
    const offers = await loadPlans(brand);
    const rec = recommend({ video, social, hotspot, travelsEu }, offers);
    const plan = rec ? offers.find((o) => o.offerId === rec.offerId) : undefined;
    if (!rec || !plan) {
      throw new ToolError(`${brandName(brand)} has no plans to suggest right now.`);
    }
    const cheaper = rec.cheaperAlternative
      ? offers.find((o) => o.offerId === rec.cheaperAlternative?.offerId)
      : undefined;
    const suggestion = {
      plan: toOfferJson(plan),
      estimatedMonthlyGb: rec.estimateGb,
      reason: REASONS[rec.reason],
      includesEuRoaming: rec.includesEuRoaming,
      cheaperAlternative:
        cheaper && rec.cheaperAlternative
          ? {
              plan: toOfferJson(cheaper),
              savingPerCycle: formatPrice(rec.cheaperAlternative.savingMinor, "EUR", "en"),
            }
          : null,
    };
    const lines = [
      `Suggested ${brandName(brand)} plan: ${plan.name} (${suggestion.plan.data}, ${suggestion.plan.price}).`,
      `Estimated use: about ${rec.estimateGb} GB a month. ${suggestion.reason}`,
      suggestion.cheaperAlternative
        ? `If you're often on Wi-Fi, ${suggestion.cheaperAlternative.plan.name} could be enough and saves ${suggestion.cheaperAlternative.savingPerCycle}.`
        : null,
      "This is a suggestion, not a guarantee.",
    ].filter(Boolean);
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { brand, suggestion } };
  },
});
