/*
 * Mock card tokenization. (Shared by onboarding review + top-up.)
 *
 * A real PSP (Adyen/Stripe/…) tokenizes the card in the browser and our code only ever sees the
 * token — the PAN never reaches our code or state. This mimics that: keep only the last 4 digits
 * for a label-ish token, and preserve a "4000" marker so the payment mock's deterministic decline
 * path stays reachable (a card number containing 4000 declines; 4242 authorizes).
 *
 * The returned token is the ONLY thing that flows to the payment seam. NEVER persist the PAN, and
 * never persist the token in client state either.
 */
export function tokenizeCardMock(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.includes("4000")) return "tok-visa-4000";
  const last4 = digits.slice(-4) || "0000";
  return `tok-visa-${last4}`;
}
