import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/my-plan")({
  head: () => ({
    meta: [
      { title: "My plan — whitelabel" },
      { name: "description", content: "My plan in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "My plan — whitelabel" },
      {
        property: "og:description",
        content: "My plan in your whitelabel prepaid mobile self-care app.",
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
      title={t("pages.myPlan.title", "My plan")}
      subtitle={t("pages.myPlan.subtitle", "Your plan details will appear here soon.")}
    />
  );
}
