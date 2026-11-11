import { useTranslation } from "react-i18next";

export function AppHeader() {
  const { t } = useTranslation();
  return (
    <header className="bg-hero text-primary-foreground">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <span className="font-display text-xl font-bold tracking-tight">{t("app.name", "whitelabel")}</span>
        <span className="hidden text-sm opacity-80 sm:inline">{t("app.tagline", "Seu celular pré-pago, do seu jeito")}</span>
      </div>
    </header>
  );
}
