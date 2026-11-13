# Design review: Customer 360 (Home + My plan), Apple-style, prepaid lens

## What I found

**1. The brown is real, and it comes from the status colour.**
It is the "warning" colour (#9a4607) with its beige wash (#fbeedd). Both are listed in the design guide, but the guide calls the colour "amber" and the value is a dark burnt orange (hue 26°, 32 % lightness), which reads as brown. It was carried over from the original Fuon palette (teal + sand), where warm earth tones fit. Next to Drei cyan and DreiGo purple it looks off-brand. It is also the largest graphic on Home: the whole data ring turns brown when data runs low.
Why it happens: an amber dark enough for body text (4.5:1) will always look brown. iOS handles this by using a bright orange only for graphics (icon, ring, bar, dot) and keeping the words in the normal text colour.

**2. A second off-brand colour: a teal tint shows up in both brands.**
The pale grey-green behind the EN/DE switch and the onboarding help panels is Fuon teal (#eef6f5). It shows in Drei and DreiGo alike.

**3. The meters say "left" but the bars show "used".**
The My plan bar for "1.8 GB of 10 GB left" is 82 % full. "2 GB of 2 GB left" shows an empty bar, which looks like nothing is left. The Home ring says "8.2 GB used" while the line under it says "1.8 GB left". Prepaid users think in what's left, so every meter should fill to what remains.

**4. The suspended line raises three alarms at once.**
You see a red "suspended" notice, a beige "top up to renew" notice and "No balance", all stacked. The suspension explains the rest, so it should be the only notice.

**5. Links on coloured notices break a design-guide rule.**
"Get help" and "Top up €14.90" are brand blue on red and beige notices. The guide says a link on a status notice takes that notice's colour.

**6. Small details.**
- "Running low: 1.8 / GB left" breaks the number away from its unit.
- The EN/DE switch takes the top bar. Apple would put language in Account. I'd leave that for later.

## What I'll change (step by step, nothing else)

1. **Warning colour, no more brown**
   - Warning becomes a clear amber (#d97a00). It's used only for graphics (ring, bar, icon, dot) and passes 3:1 on white.
   - The wash becomes a lighter, cleaner cream (#fff4e0).
   - Warning words ("Running low", "Pending") switch to the normal dark text colour. The amber icon or dot next to them carries the signal, so it's still colour + word.
   - The design guide gets updated to match.
2. **Remove the teal tint.** The base light tint becomes a neutral grey, so neither brand shows Fuon teal.
3. **Meters fill to what's left.** The Home ring and My plan bars fill to the remaining amount, and the ring centre reads "1.8 GB left".
4. **One alarm at a time.** When a line is suspended, Home shows only the suspension notice. The renewal notice is hidden.
5. **Links on notices take the notice's style.** On red that's red. On amber that's dark text, underlined.
6. **Keep "1.8 GB" together** on one line, in English and German.

## Verify
- A small test reads the colour tokens and checks the contrast rules: the warning colour is at least 3:1 on white, and every text colour is at least 4.5:1 on its background.
- Update the tests for the ring and bar fill.
- Screenshots on phone for Drei and DreiGo: healthy, low data, suspended. Plus My plan in German.

## Later (not in this step)
- Move the EN/DE switch into Account.
- The guide specifies a coloured brand tile behind the logo, but the app shows the plain logo. Decide which is right.

## Technical notes
- `src/styles/tokens.css`: `--warning`, `--warning-tint`, base `--surface-tint` (system tokens, so the edit happens once in `:root`, not in a brand block). `design/DESIGN.md` front matter + Colors section updated to match.
- Text swaps from `text-warning` to `text-text-primary` with a warning icon or dot in `usage-summary-card`, `allowance-row`, `my-plan` caption, `line-status-badge`, `plan-summary-card`, `renewal-notice`, `tenant-not-found-banner`.
- Ring and bar fill read remaining over total. The state rules in `customer360-rules.ts` stay unchanged.
- New colocated `src/styles/tokens.test.ts` parses tokens.css and computes WCAG contrast.
