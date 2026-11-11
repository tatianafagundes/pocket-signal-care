import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — whitelabel" },
      { name: "description", content: "Home in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Home — whitelabel" },
      { property: "og:description", content: "Home in your whitelabel prepaid mobile self-care app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return <PageShell title={t("pages.home.title", "Olá! Que bom ter você aqui")} subtitle={t("pages.home.subtitle", "Seu resumo de saldo e uso aparecerá aqui em breve.")} />;
}
