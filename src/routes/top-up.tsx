import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/top-up")({
  head: () => ({
    meta: [
      { title: "Top up — whitelabel" },
      { name: "description", content: "Top up in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Top up — whitelabel" },
      { property: "og:description", content: "Top up in your whitelabel prepaid mobile self-care app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return <PageShell title={t("pages.topUp.title", "Recarga")} subtitle={t("pages.topUp.subtitle", "Em breve você poderá recarregar em poucos toques.")} />;
}
