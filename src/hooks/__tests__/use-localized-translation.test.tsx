import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { i18n } from "@/i18n";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

const hydration = vi.hoisted(() => ({ ready: false }));

vi.mock("@tanstack/react-router", () => ({ useHydrated: () => hydration.ready }));

afterEach(async () => {
  cleanup();
  hydration.ready = false;
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

describe("useLocalizedTranslation", () => {
  it("pins to the server language (en) before hydration, even when i18n is de-AT", async () => {
    await act(async () => {
      await i18n.changeLanguage("de-AT");
    });
    hydration.ready = false;

    const { result } = renderHook(() => useLocalizedTranslation());

    // Pre-hydration t is a fixed-T on "en" so the first client paint matches SSR.
    expect(result.current.t("pages.home.title")).toBe("Hi there, great to see you");
  });

  it("follows the active language after hydration (so switching to DE translates)", async () => {
    hydration.ready = true;
    await act(async () => {
      await i18n.changeLanguage("de-AT");
    });

    const { result } = renderHook(() => useLocalizedTranslation());

    // Post-hydration t tracks the live language → German.
    expect(result.current.t("pages.home.title")).toBe("Schön, dich zu sehen");
  });
});
