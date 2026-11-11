import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — whitelabel" },
      { name: "description", content: "Account in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Account — whitelabel" },
      {
        property: "og:description",
        content: "Account in your whitelabel prepaid mobile self-care app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("pages.account.title", "My account")}
      subtitle={t("pages.account.subtitle", "Your details and preferences will live here.")}
    />
  );
}
