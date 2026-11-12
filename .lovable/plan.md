# UI review: prepaid self-care, seen by prepaid users

Reviewed on a phone-sized screen (390px): Home, My plan, Top up, Add-ons, Account, Support, and the onboarding wizard.

## What prepaid users told us (simulated research)

Prepaid users check the app in short bursts with one question: "How much do I have left, and when does it run out?" Their fears are running out mid-month, surprise charges, and auto-renew taking money unexpectedly.

Personas used:
- **Budget-watcher (Lena, 34)** — tops up €10–15, checks balance daily, hates hidden renewals.
- **Light user (Herbert, 68)** — needs large text, plain words, one obvious action.
- **Traveller / newcomer (Amir, 24)** — roaming, may not speak German, wants to start without a contract.
- **Parent paying for a teen** — tops up someone else's number.

## Findings

### 1. Home does not answer the main question (highest impact)
Home shows only a greeting and "summary will appear soon". Prepaid best practice: the first thing on screen is **balance (€), data left, and renewal date**, with **Top up** as the main button.

### 2. Six tabs is too many
Apple guidance and prepaid apps use 4–5. Labels crowd at 390px. Suggested: **Home, Top up, Add-ons, Plan, More** (Account + Support inside "More", with Support also on Home).

### 3. Main button uses the brand blue, not ink
"Start onboarding" and "Continue" are brand-coloured; project rules say primary buttons are dark ink. "Continue" disabled state also looks like an enabled light-blue button.

### 4. Onboarding plan list: cost clarity
- "auto-renews" is small grey text — prepaid users want this prominent with "cancel anytime" reassurance.
- Price should be the largest item per card; plan name "up" alone is confusing.
- Focus outline on the heading ("Choose a plan" purple box) appears on page load — looks like a bug to users.
- Back/Continue sit below four tall cards; make them sticky at the bottom.

### 5. Empty pages feel unfinished
Every tab says "coming soon". Replace with realistic preview states (sample balance, top-up amounts €5/€10/€20/€30, add-on cards, help topics) so testers can judge the flow.

### 6. Trust and accessibility
- Language switch "EN/DE" is fine, but should remember the choice after reload.
- Status (low balance, expiring soon) must show colour + word.
- Check text size scaling and 44px tap targets in the tab bar.

## Proposed work (in priority order)
1. Home dashboard: balance card, data/minutes gauges, renewal date, Top up button, low-balance banner (mock data via existing seams).
2. Tab bar to 5 items with a "More" page.
3. Primary buttons switched to ink; clearer disabled state.
4. Plan cards: price-first layout, visible auto-renew + cancel note, sticky Back/Continue, no focus ring on load.
5. Top up page: amount chips, payment method, confirmation.
6. Remember language choice.
7. All new text in English and German.

## Technical notes
- Data through `api` from the seam layer (mocked), never directly in components.
- Colours only via tokens; status uses token + label.
- Add tests for low-balance threshold and renewal-date formatting.
