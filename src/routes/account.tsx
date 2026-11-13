import { createFileRoute } from "@tanstack/react-router";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { PageShell } from "@/components/page-shell";
import { DemoStateSwitcher } from "@/components/demo/demo-state-switcher";

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
  const { t } = useLocalizedTranslation();
  return (
    <PageShell
      title={t("pages.account.title", "My account")}
      subtitle={t("pages.account.subtitle", "Your details and preferences will live here.")}
    >
      {/* Dev-only demo tool; renders nothing in a real build or when signed out. */}
      <DemoStateSwitcher />
    </PageShell>
  );
}
