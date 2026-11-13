import { tokenizeCardMock } from "@/lib/card-token";

/*
 * The tokenizer is shared by onboarding review and top-up. What matters: it never returns the PAN,
 * it preserves the "4000" decline marker (so the payment mock's deterministic decline stays
 * reachable), and otherwise encodes only the last 4 digits.
 */
describe("tokenizeCardMock", () => {
  it("preserves the 4000 decline marker", () => {
    expect(tokenizeCardMock("4000 0000 0000 0002")).toBe("tok-visa-4000");
  });

  it("encodes only the last 4 digits for a normal card", () => {
    expect(tokenizeCardMock("4242 4242 4242 4242")).toBe("tok-visa-4242");
  });

  it("never returns the full PAN", () => {
    const token = tokenizeCardMock("5555 5555 5555 1234");
    expect(token).toBe("tok-visa-1234");
    expect(token).not.toContain("5555");
  });

  it("falls back to 0000 when there are no digits", () => {
    expect(tokenizeCardMock("")).toBe("tok-visa-0000");
  });
});
