import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import "@/i18n";
import { i18n } from "@/i18n";
import { TenantProvider } from "@/components/tenant-provider";
import { LanguageSelector } from "@/components/language-selector";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

/*
 * Reproduces the REAL "click DE, nothing translates" flow end-to-end: the real provider, the
 * real selector, and a consumer that uses useLocalizedTranslation (as the routes/tab bar do).
 * No mocking of useHydrated or useTenant — this is what the user actually experiences.
 */

function HomeLabel() {
  const { t } = useLocalizedTranslation();
  return <h1>{t("pages.home.title")}</h1>;
}

afterEach(async () => {
  cleanup();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

describe("language switch (integration)", () => {
  it("switches the visible page title to German when DE is clicked", async () => {
    render(
      <TenantProvider>
        <LanguageSelector />
        <HomeLabel />
      </TenantProvider>,
    );

    // Starts in English (en default).
    await waitFor(() => {
      expect(screen.getByRole("heading").textContent).toBe("Hi there, great to see you");
    });

    // Click the DE pill.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deutsch (AT)" }));
    });

    // The visible title should now be German.
    await waitFor(() => {
      expect(screen.getByRole("heading").textContent).toBe("Schön, dich zu sehen");
    });
    expect(i18n.language).toBe("de-AT");
  });
});
