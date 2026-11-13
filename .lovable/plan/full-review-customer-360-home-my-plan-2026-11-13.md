# Full review: Customer 360 (Home + My plan)

I reviewed Home and My plan on phone (390 px) and on your desktop size (1040 px), in Drei and DreiGo, English and German. I covered the healthy, low-data, suspended and loading states, and read through the empty, error, expired and pending states. Each finding comes from one of six angles.

## What I found

### A. Glanceability (Apple)
1. **The top of Home is loose.** The number and its status badge float on their own between the greeting and the balance, with a large gap above. On iOS the number would sit right under the name, as one block.
2. **Dates need doing math.** "Renews Dec 8, 2026" makes you count days. "Renews in 25 days" answers the real question instantly. The year is noise for something less than a month away.
3. **The Data and Plan cards are uneven.** The Plan card is half empty, and its price has no context ("€14.90", but per what?).
4. **My plan feels heavy.** Four separate boxed cards for Data, Calls, Texts and EU roaming read as four alerts. iOS would group them in one card with thin dividers.
5. **Units repeat.** "175 SMS of 200 SMS left" should read "175 of 200 SMS left".

### B. Prepaid money anxiety (calm, reassuring tone)
6. **No reassurance when things are fine.** The balance (€15.00) covers the Dec 8 renewal (€14.90), but nothing says so. Prepaid users worry most about "will my plan renew?". We only speak up when it won't.
7. **Auto-renewal is invisible.** Nothing says the plan renews automatically from the balance. This is the top trust question in prepaid, and onboarding flagged it too.
8. **"Running low" has no way out.** Data is low, but neither screen offers "Add data". The generic Add-ons card on Home repeats the tab bar and doesn't react to the low state.
9. **No one says when allowances come back.** "1.8 GB left" never tells you when the 10 GB refills.

### C. Design guide
10. **The loading placeholders are brand-tinted.** They flash Drei cyan or DreiGo purple. The guide keeps the brand colour for buttons, the hero, links and selection, so placeholders should be neutral grey.
11. **The loading layout doesn't match the real screen.** There's no number row, so the content jumps when it loads. The title also switches from "Hi there" to "Hi Alex".

### D. Accessibility
12. **Screen readers miss the numbers.** The Data and Plan cards read only "Data allowance — open My plan". The hidden label replaces what's inside, so a VoiceOver user never hears "1.8 GB left, running low" or the price and renewal date.
13. **Copying can fail silently.** If copying the number fails, nothing tells you.

### E. States
14. A pending line shows a "Pending" badge but no sentence saying what's happening or when it will be ready.

### F. Desktop (1040 px)
15. The narrow phone column in the middle is intended (the guide says one phone width), so I'd keep it. It's listed under Later.

## What I'll change in this step

**Home**
- Greeting with the number and status directly under it, as one block. The big gap goes.
- Balance card: when the balance covers the next renewal, a calm line with a green dot: "Covers your renewal in 25 days". When it doesn't, the existing top-up notice stays.
- Plan card: "€14.90 · renews in 25 days", then "Automatically, from your balance". The exact date appears when it's more than 30 days away.
- When data is low or used up, the generic Add-ons card becomes "Add data". It shows the amount left and opens Add-ons. When data is fine, the card is hidden, since the tab bar already leads there.

**My plan**
- The plan card adds "Renews automatically from your balance" and the relative renewal ("in 25 days · Dec 8").
- All allowances sit in one card with thin dividers, under one line: "Allowances refill on Dec 8".
- Shorter amounts: "175 of 200 SMS left".
- A low or used-up data row gets an "Add data" link.

**Everywhere on these two screens**
- Neutral grey loading placeholders, shaped like the real layout, with no "Hi there" flash.
- Screen readers hear the actual numbers on the Data and Plan cards.
- Copying the number shows a friendly message if it fails.
- A pending line gets one sentence: "We're activating your line — this usually takes a few minutes."

All new wording in English and German.

## Verify
- Tests for the new rules, using the demo data: €15.00 against a €14.90 plan counts as "covered". The renewal reads as "in 25 days" on Nov 13 for Dec 8. Exactly 30 days away still reads as relative, and more than 30 shows the date. The Add data card appears only when data is low or used up.
- Screenshots on phone and desktop for Drei and DreiGo, in English and German, with healthy, low-data and suspended lines. I'll also check the screen-reader text on the Data and Plan cards.

## Later (not in this step)
- Recent activity: last top-up and what the balance was spent on.
- Five tabs instead of six (Apple's limit). Move language to Account.
- A wider desktop layout, if you want one.
- Demo accounts for unlimited, expired balance and pending, so those states can be seen in the preview.

## Technical notes
- New pure rules in `src/services/customer360-rules.ts`: `renewalCovered(c360)`, `daysUntil(iso, now)` and `homeDataPrompt(c360)` ("low" | "depleted" | null). Screens don't derive these inline.
- `Skeleton` default switches from `bg-primary/10` to a neutral token. HomeSkeleton mirrors LineHeader + Balance + grid.
- The Data and Plan cards drop the link `aria-label` and add an `sr-only` "open My plan" suffix, so the content stays in the accessible name.
- Relative dates use a locale-aware formatter (`Intl.RelativeTimeFormat` or i18n plurals) for EN and DE.
