import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistPanel } from "@/components/onboarding/assist-panel";
import { TenantProvider } from "@/components/tenant-provider";
import type { Offer } from "@/services/model";
import "@/i18n";

afterEach(cleanup);

const offers: Offer[] = [
  {
    offerId: "start",
    tenantId: "drei",
    name: "up Start",
    dataAmount: "5 GB",
    priceMinor: 990,
    currency: "EUR",
    validityDays: 30,
  },
  {
    offerId: "up",
    tenantId: "drei",
    name: "up",
    dataAmount: "15 GB",
    priceMinor: 1490,
    currency: "EUR",
    validityDays: 30,
    euRoaming: true,
  },
  {
    offerId: "max",
    tenantId: "drei",
    name: "up Max",
    dataAmount: "40 GB",
    priceMinor: 1990,
    currency: "EUR",
    validityDays: 30,
    euRoaming: true,
  },
];

function renderPanel() {
  const onChoose = vi.fn();
  const onSuggestion = vi.fn();
  render(
    <TenantProvider>
      <AssistPanel offers={offers} onChoose={onChoose} onSuggestion={onSuggestion} />
    </TenantProvider>,
  );
  return { onChoose, onSuggestion };
}

describe("AssistPanel", () => {
  it("should ask one question at a time and suggest up Max for daily video plus lots of social", () => {
    const { onChoose, onSuggestion } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Help me choose" }));
    expect(screen.getByText("Question 1 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /About 30 minutes a day/ }));
    expect(screen.getByText("Question 2 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Lots, most of the day/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Never/ }));
    fireEvent.click(screen.getByRole("button", { name: /No, mostly in Austria/ }));

    expect(onSuggestion).toHaveBeenLastCalledWith(
      expect.objectContaining({ offerId: "max", estimateGb: 19 }),
    );
    expect(screen.getByText("We estimate you use about 19 GB a month.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose up Max" }));
    expect(onChoose).toHaveBeenCalledWith("max");
    expect(screen.getByText(/Suggested for you: up Max/)).toBeTruthy();
  });

  it("should offer the cheaper plan as an alternative choice", () => {
    const { onChoose } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Help me choose" }));
    fireEvent.click(screen.getByRole("button", { name: /About 30 minutes a day/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lots, most of the day/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Never/ }));
    fireEvent.click(screen.getByRole("button", { name: /No, mostly in Austria/ }));
    fireEvent.click(screen.getByRole("button", { name: "Choose up instead" }));
    expect(onChoose).toHaveBeenCalledWith("up");
  });

  it("should go back to the previous question and keep its answer marked", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Help me choose" }));
    fireEvent.click(screen.getByRole("button", { name: /^Rarely/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Question 1 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Rarely/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
