import { createFileRoute } from "@tanstack/react-router";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/add-ons")({
  head: () => ({
    meta: [
      { title: "Add-ons — whitelabel" },
      { name: "description", content: "Add-ons in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Add-ons — whitelabel" },
      {
        property: "og:description",
        content: "Add-ons in your whitelabel prepaid mobile self-care app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useLocalizedTranslation();
  return (
    <PageShell
      title={t("pages.addOns.title", "Add-ons")}
      subtitle={t("pages.addOns.subtitle", "Data, minutes and roaming bundles are coming soon.")}
    />
  );
}
