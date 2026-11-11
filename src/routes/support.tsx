import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — whitelabel" },
      { name: "description", content: "Support in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Support — whitelabel" },
      {
        property: "og:description",
        content: "Support in your whitelabel prepaid mobile self-care app.",
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
      title={t("pages.support.title", "Support")}
      subtitle={t("pages.support.subtitle", "We're here for you. The help center is coming soon.")}
    />
  );
}
