import {
  clearTopUpProgress,
  emptyTopUpProgress,
  loadTopUpProgress,
  saveTopUpProgress,
  TOPUP_PROGRESS_TTL_MS,
} from "@/lib/topup-progress";

afterEach(() => clearTopUpProgress());

describe("topup-progress persistence", () => {
  it("round-trips progress for the same tenant+customer+amount", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: true,
      credited: false,
    });
    const loaded = loadTopUpProgress("drei", "cust-1", 2000);
    expect(loaded).toEqual({ authorizationRef: "auth-9", captured: true, credited: false });
  });

  it("starts clean for a DIFFERENT amount (a different top-up must not resume)", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: true,
      credited: false,
    });
    expect(loadTopUpProgress("drei", "cust-1", 5000)).toEqual(emptyTopUpProgress());
  });

  it("starts clean for a different customer or tenant", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: true,
      credited: false,
    });
    expect(loadTopUpProgress("drei", "cust-2", 2000)).toEqual(emptyTopUpProgress());
    expect(loadTopUpProgress("dreigo", "cust-1", 2000)).toEqual(emptyTopUpProgress());
  });

  it("starts clean once the TTL has elapsed", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: true,
      credited: false,
    });
    const past = Date.now() + TOPUP_PROGRESS_TTL_MS + 1;
    expect(loadTopUpProgress("drei", "cust-1", 2000, past)).toEqual(emptyTopUpProgress());
  });

  it("never persists a token/PAN — only ref + flags are in storage", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: true,
      credited: true,
    });
    const raw = window.sessionStorage.getItem("topup-progress:v1") ?? "";
    expect(raw).toContain("auth-9");
    expect(raw).not.toMatch(/tok-|4242|4000/); // no card token or PAN digits
  });

  it("clear removes the progress", () => {
    saveTopUpProgress("drei", "cust-1", 2000, {
      authorizationRef: "auth-9",
      captured: false,
      credited: false,
    });
    clearTopUpProgress();
    expect(loadTopUpProgress("drei", "cust-1", 2000)).toEqual(emptyTopUpProgress());
  });
});
