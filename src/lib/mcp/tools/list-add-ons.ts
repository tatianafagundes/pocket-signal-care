import { defineTool } from "@lovable.dev/mcp-js";

import { brandName, brandSchema, loadAddOns, offerLine, toOfferJson } from "@/lib/mcp/catalog";

export default defineTool({
  name: "list_add_ons",
  title: "List add-ons",
  description: "List the extras (such as extra data) a brand sells on top of a plan, with prices.",
  inputSchema: { brand: brandSchema },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ brand }) => {
    const addOns = (await loadAddOns(brand)).map(toOfferJson);
    const text =
      addOns.length === 0
        ? `${brandName(brand)} has no add-ons available right now.`
        : `${brandName(brand)} add-ons:\n${addOns.map(offerLine).join("\n")}`;
    return { content: [{ type: "text", text }], structuredContent: { brand, addOns } };
  },
});
