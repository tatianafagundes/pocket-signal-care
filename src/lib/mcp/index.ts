import { defineMcp } from "@lovable.dev/mcp-js";

import listPlans from "@/lib/mcp/tools/list-plans";
import listAddOns from "@/lib/mcp/tools/list-add-ons";
import suggestPlan from "@/lib/mcp/tools/suggest-plan";

export default defineMcp({
  name: "pocket-signal-care",
  title: "Pocket Signal Care",
  version: "0.1.0",
  instructions:
    "Public catalogue for the Drei and DreiGo prepaid brands. Look up plans and add-ons with prices, or get a plan suggestion from everyday usage. No customer accounts, balances or numbers are available here.",
  tools: [listPlans, listAddOns, suggestPlan],
});
