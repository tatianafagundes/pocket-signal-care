# Onboarding entry from Home + focused wizard

## What you'll see
- Home shows a "New to {brand}? Get started" card with a "Start onboarding" button that opens the wizard.
- While inside onboarding, the bottom tab bar is hidden so the wizard has the full screen.
- Finishing onboarding returns you to Home, where the tab bar reappears.

## Changes
1. Home page: add an onboarding card (heading, short body, ink "Start onboarding" button linking to /onboarding), using existing design tokens, no hardcoded colours.
2. App layout: render the bottom tab bar only when the current path does not start with /onboarding (read via the router location).
3. Success step: make sure its final button links to Home.
4. Translations: add the new card strings to en.json and de-AT.json (parity test must stay green).
5. Verify: run tests, open Home and the wizard in a browser, check the tab bar hides/shows.
6. Finish with a written summary of every code change made in this step.
