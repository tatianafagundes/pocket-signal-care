# Onboarding review: prepaid users' view

Scope: the 6-step sign-up wizard only (Welcome, Plan, Account, Details, Number, Review, plus Success). The full-app review is saved separately for later.

## How prepaid users see it (simulated research)
Personas: **Lena** (budget-watcher, fears hidden renewals), **Herbert** (68, needs plain words and big targets), **Amir** (newcomer, roaming, no contract), **a parent** setting up a teen's line. Their core need: "What will this cost me, can I stop it, and when can I use my phone?"

## Findings

### Trust and cost (highest impact)
1. **Auto-renew is hidden.** "€14.90 every 30 days · auto-renews" is small grey text. Make price the largest item, and show "Renews every 30 days, cancel anytime" clearly.
2. **Plan names are unclear.** "up", "up Max" read as typos. Add a one-line "good for…" per plan (e.g. "Light browsing and chat").
3. **No balance surprise at the end.** "You start with no balance" appears only at Review and Success. Prepaid users need to know upfront: say on Welcome and Plan how payment works (first top-up activates the plan).
4. **Success ends on "Go to my plan"** while the user has €0 — main action should be **Top up now**, with "Later" as a secondary option.

### Flow and order
5. **Account before name feels backwards.** Order is Plan → Account (email/password) → Details (name) → Number. Picking the number is the fun moment; move it right after Plan, and ask for name together with email.
6. **Steps can be skipped by URL.** Opening the Success page directly shows "You're all set / Your plan is active" with nothing chosen; middle steps show earlier steps as "Completed". Each step should send the user back to the first unfinished step.
7. **Review shows dashes and a red warning** when data is missing, instead of guiding the user back automatically.

### Number step
8. Numbers show as "+4368140000001" — hard to read. Format as "+43 681 4000 0001", add a "Show more numbers" option, and an option to **keep my current number** (porting) — key for switchers.
9. Explain what "hold" means ("reserved for you for 30 minutes").

### Visual and accessibility
10. **Purple focus box on every heading** on page load looks like a bug; keep focus moving to the heading for screen readers but hide the outline unless using a keyboard.
11. **Main buttons use brand blue**; rules say dark ink. Disabled "Continue" looks enabled-but-faded — make disabled clearly different and say why ("Choose a plan to continue").
12. **Back/Continue scroll off screen** on Plan; make them sticky at the bottom.
13. **Progress dots are tiny** and unlabeled visually; add step name ("Step 2 of 6 · Plan").
14. Password rules: show live ticks as the user types, plus a show/hide password toggle.

## Proposed work (priority order)
1. Step guard: no skipping, Success only after activation.
2. Plan cards: price-first, clear renewal + cancel note, "good for" line, upfront "how payment works".
3. Reorder steps: Plan → Number → You (name + email + password) → Review → Success.
4. Number step: readable format, more numbers, reservation note, "keep my number" entry (mocked).
5. Success: "Top up now" primary.
6. Visual fixes: ink buttons, explained disabled state, sticky actions, focus outline only for keyboard, step labels, password show/hide.
7. All new text in English and German.

## Technical notes
- Step guard lives in the onboarding layout using the existing persisted onboarding state.
- Number porting is a mocked seam call; no real backend change.
- Tests: guard redirects to first unfinished step; Success is blocked before activation; phone number formatting.
- The saved full-app review lives in the plan archive folder.
