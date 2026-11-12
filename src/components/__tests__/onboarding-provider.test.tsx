import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { OnboardingProvider } from "@/components/onboarding-provider";
import { TenantProvider } from "@/components/tenant-provider";
import { useOnboarding } from "@/hooks/use-onboarding";
import { initialOnboardingState, saveOnboardingState } from "@/lib/onboarding-persistence";
import "@/i18n";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function Probe() {
  const { state, restored } = useOnboarding();
  return <output>{`${state.step}|${String(restored)}`}</output>;
}

function tree() {
  return (
    <TenantProvider>
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>
    </TenantProvider>
  );
}

describe("OnboardingProvider", () => {
  it("should render the clean state first so a reload mid-flow hydrates without a mismatch", () => {
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "review" });
    expect(renderToString(tree())).toContain("welcome|false");
  });

  it("should restore saved progress after mount and mark it restored", () => {
    saveOnboardingState({ ...initialOnboardingState("drei"), step: "review" });
    render(tree());
    expect(screen.getByRole("status").textContent).toBe("review|true");
  });
});
