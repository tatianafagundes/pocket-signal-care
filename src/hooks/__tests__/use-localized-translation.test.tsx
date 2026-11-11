import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import "@/i18n";
import { i18n } from "@/i18n";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

afterEach(async () => {
  cleanup();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

describe("useLocalizedTranslation", () => {
  it("translates in the current language", async () => {
    const { result } = renderHook(() => useLocalizedTranslation());
    expect(result.current.t("pages.home.title")).toBe("Hi there, great to see you");
  });

  it("re-renders in the new language when i18n.changeLanguage fires (DE switch)", async () => {
    const { result } = renderHook(() => useLocalizedTranslation());
    expect(result.current.t("pages.home.title")).toBe("Hi there, great to see you");

    await act(async () => {
      await i18n.changeLanguage("de-AT");
    });

    // The hook is reactive — the same t now returns German.
    expect(result.current.t("pages.home.title")).toBe("Schön, dich zu sehen");
  });
});
