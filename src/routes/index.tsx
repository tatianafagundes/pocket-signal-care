import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

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
  const { tenantName } = useTenant();
  return (
    <PageShell
      title={t("pages.home.title", "Hi there, great to see you")}
      subtitle={t("pages.home.subtitle", "Your balance and usage summary will appear here soon.")}
    >
      {/* Onboarding entry for prospective customers; existing users keep the dashboard. */}
      <section aria-labelledby="home-onboarding-title">
        <h2 id="home-onboarding-title" className="type-body font-semibold text-text-primary">
          {t("pages.home.onboarding.title", "New to {{brand}}? Get started", {
            brand: tenantName,
          })}
        </h2>
        <p className="type-body mt-1 text-text-secondary">
          {t(
            "pages.home.onboarding.body",
            "Pick your prepaid plan, choose your number and get connected in minutes.",
          )}
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/onboarding">{t("pages.home.onboarding.cta", "Start onboarding")}</Link>
        </Button>
        <p className="mt-3 text-center type-caption text-text-secondary">
          <Link to="/login" className="focus-ring rounded-control text-accent-ink">
            {t("login.haveAccount", "Already have an account? Sign in")}
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
