import { defineTool } from "@lovable.dev/mcp-js";

import { brandName, brandSchema, loadPlans, offerLine, toOfferJson } from "@/lib/mcp/catalog";

export default defineTool({
  name: "list_plans",
  title: "List prepaid plans",
  description:
    "List the prepaid plans a brand sells, with data, price, renewal cycle, EU roaming and who each plan is good for.",
  inputSchema: { brand: brandSchema },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ brand }) => {
    const plans = (await loadPlans(brand)).map(toOfferJson);
    const text =
      plans.length === 0
        ? `${brandName(brand)} has no plans available right now.`
        : `${brandName(brand)} prepaid plans (no contract, paid from balance):\n${plans.map(offerLine).join("\n")}`;
    return { content: [{ type: "text", text }], structuredContent: { brand, plans } };
  },
});
