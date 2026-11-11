import { createFileRoute } from "@tanstack/react-router";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — whitelabel" },
      { name: "description", content: "Home in your whitelabel prepaid mobile self-care app." },
      { property: "og:title", content: "Home — whitelabel" },
      {
        property: "og:description",
        content: "Home in your whitelabel prepaid mobile self-care app.",
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
      title={t("pages.home.title", "Hi there, great to see you")}
      subtitle={t("pages.home.subtitle", "Your balance and usage summary will appear here soon.")}
    />
  );
}
