# Onboarding review: senior Apple UX + designer, prepaid telecom lens

Scope: the full sign-up flow as it is today. The saved full-app review stays untouched for later.

```text
Welcome -> Plan -> SIM type -> Number -> Add-ons -> Account -> Delivery (physical SIM only) -> Review -> Success
```

## Step 1 — Walk the real flow first
Before changing anything, I walk both paths (eSIM and physical SIM) on a phone-size screen, in both brands and in English and German, and take a screenshot of every step. The findings below come from reading the screens and wording. The walk-through confirms or drops each one, so nothing gets fixed on a guess.

## Expected findings (to confirm in Step 1)

### The journey as a whole
1. **Up to 8 steps feels long for prepaid.** Prepaid buyers expect "a SIM in minutes." Add-ons sit in the middle of the main path. One option is to offer them on Review ("Add a data boost?") instead of as a step of their own.
2. **The progress label should name the step** ("Step 3 of 7 · Your number"), and the total should update when Delivery appears or drops away after the SIM choice.
3. **Emotional peak:** picking a number is the fun moment. Check that it feels rewarding, with a clear "This number is yours for 30 minutes."

### Trust and cost
4. **One clear money story from start to finish.** Welcome, Plan, Review and Success all explain payment ("starts with your first top-up", "authorized today", "first top-up"). Check that the wording matches across steps and that the user always knows what is charged today and what happens next.
5. **Renewal clarity on plan cards:** price first, with "Renews every 30 days · cancel anytime" readable, not grey small print.
6. **Review = no surprises:** a total for today, the renewal date, and an "Edit" button that jumps to each step and comes back to Review.

### SIM, number and delivery
7. **eSIM vs physical:** explain in plain words ("Works now on newer phones" / "Arrives by post in 2–3 days"), plus a "Does my phone support eSIM?" help line.
8. **Keep my current number** (porting), which is still open: add it as an option on the Number step, mocked for now.
9. **Delivery form:** country set by default, postal code before city, and the browser's autofill hints for each field.

### Account
10. **Live password rule ticks** as the user types, next to the existing show/hide toggle. Keep error messages kind ("Use at least 8 characters").

### Success
11. **eSIM install path** should be the hero for eSIM buyers, with "Top up now" right after. Physical SIM buyers should see the delivery date and what to do when the SIM arrives.

### Look, feel and accessibility
12. Main buttons in dark ink, Back/Continue fixed at the bottom on long steps, large tap targets (44px), focus outline only for keyboard users, and status shown as colour plus a word everywhere.
13. German check: long German words must not break the buttons or cards.

## Then
I'll show you the confirmed findings, ranked by impact, and fix the top ones in the same turn. Any new wording goes into English and German. Tests will cover the rules that change, such as the step count with or without Delivery and the porting option.

## Technical notes
- Walk-through: Playwright, 390x844 and desktop, both `data-brand` values, both locales.
- Changes to step order go through `ONBOARDING_STEPS` and the pure guard in `src/lib/onboarding-guard.ts`, with guard tests updated.
- Porting is a mocked seam call that returns a `SeamResult`. No real backend change.
