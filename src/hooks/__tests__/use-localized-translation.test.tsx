import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { i18n } from "@/i18n";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";

const hydration = vi.hoisted(() => ({ ready: false }));

vi.mock("@tanstack/react-router", () => ({ useHydrated: () => hydration.ready }));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ locale: "de-AT" }) }));

afterEach(async () => {
  cleanup();
  hydration.ready = false;
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

describe("useLocalizedTranslation", () => {
  it("should pin the server locale until hydration completes even when the shared locale changes", async () => {
    await i18n.changeLanguage("de-AT");
    const { result, rerender } = renderHook(() => useLocalizedTranslation());

    expect(result.current.t).toHaveProperty("lng", "en");

    hydration.ready = true;
    rerender();

    expect(result.current.t).toHaveProperty("lng", "de-AT");
  });
});
