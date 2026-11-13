# Support screen (Figma P12) — decisions, deliberate divergences & follow-ups

**Status:** shipped (`/support`), demo-faithful. **Audience:** whoever reviews the Support screen or
builds the follow-up screens it should eventually link to (P16, P22, P23) and chat.

The Support screen replaced a "coming soon" placeholder with the Figma P12 layout, adapted to what
the app can honestly back. Where the Figma links to screens that don't exist yet, we diverged rather
than ship dead links. This records those divergences (all deliberate) and anchors the follow-ups.

Scope anchors:
- UI: `src/routes/support.tsx`.
- Service-strip tone: `lineStatus` in `src/services/customer360-rules.ts` + `StatusDot`
  (`src/components/status/status-dot.tsx`).
- i18n: `pages.support.*` in `src/locales/en.json` + `src/locales/de-AT.json`.

---

## What shipped

- **Service strip** — a status dot + sentence ("All services online · Mobile"), the tone derived
  from the real line state (`lineStatus`: active → success, pending → warning, suspended → danger).
  So a suspended demo line reads "Mobile service suspended" with a red dot. Colour is never the only
  signal (dot + word).
- **Quick actions** — two action rows: **Check balance** (→ Home) and **Top up** (→ /top-up).
- **Help topics** — the three Figma topics as inline-expanding accordions, copy verbatim from the
  Figma, self-service first.

## Deliberate divergences from the Figma (with reasons)

1. **Chat omitted.** The Figma leads with a "Chat with us" card. There is no chat backend, and we
   decided not to fake a live-agent affordance this round. Omitted rather than shown as a dead or
   "coming soon" card. → Follow-up below.

2. **Service strip is informative, not a link.** The Figma strip has a chevron to a Service status
   screen (P22), which doesn't exist. Shipping the chevron would be a dead link, so the strip
   carries no chevron and is not a tap target. The status it shows is still honest (from the line
   state). → P22 follow-up.

3. **Two action rows instead of a 4-up quick-tile grid.** The Figma has four tiles: Check balance,
   Top up, Report an issue (→ P23), Track a top-up (→ P16). Two of those four target screens don't
   exist. We kept the two with real destinations and dropped the other two (no dead links). With
   only two items, a 4-up grid reads sparse, so they're rendered as list rows — cleaner for two and
   consistent with the market "list of actions" pattern. → P16 / P23 follow-ups.

4. **Help topics expand inline instead of navigating.** The Figma rows imply a detail destination.
   Rather than add three detail screens, the topics are inline accordions carrying the Figma's own
   answer copy. This keeps the content real without new screens to maintain, and matches the
   dominant market pattern (topics list on the support screen itself).

5. **Contact sits after self-service, not before.** The Figma puts the contact card at the top; the
   market pattern (and our choice) is self-service first, contact after. With chat omitted this is
   moot now, but it's the intended order when chat returns.

6. **de-AT title kept as "Hilfe"** (matches the tab label), with the new strings in the formal
   register used across the app's de-AT.

Grounding for the help-center shape (self-service first; topics as a list on the support screen;
contact below): market references on Mobbin — *Content was rephrased for compliance with licensing
restrictions.*
- [Fetch — Help Center](https://mobbin.com/screens/4f0c7c63-e5eb-4796-9bb6-a8c9673ceb3d)
- [Chime — "Still need help?" below topics](https://mobbin.com/screens/3f613fb0-0c67-4508-874b-3138c7187ac5)
- [Lloyds — categories + "Browse all"](https://mobbin.com/screens/1ba4929f-a4cd-464e-8b82-160086f508a8)
- [Badoo — help-center topic list](https://mobbin.com/screens/7a7dc05e-9b15-4ee9-994d-054a73da0a17)

---

## Follow-ups (anchored, not built)

- **P22 Service status** — a real service-status screen (outage/maintenance). When it exists, the
  strip gains its chevron and links to it. Note: there is no service-status seam today; that screen
  needs a data source decided up front (honest "no known issues" vs real outage data).
- **P23 Report an issue → P24 Describe → P25 Request status** — the report-a-fault flow. Restores
  the "Report an issue" action tile and the request-tracking screens.
- **P16 Top-up history** — restores the "Track a top-up" action tile. The charging seam already has
  the activity feed (`getActivity`), so this is largely UI.
- **Chat** — the "Chat with us" card, once a chat/hand-off backend (or an honest external route)
  exists.

---

## Multi-perspective review (Nov 2026)

- **Correctness.** Strip tone comes from `lineStatus` (real state), not a hardcoded "online"; both
  action rows point at real, existing routes; topics are static copy. ✓
- **Honesty / content.** No dead links; the strip never claims "online" for a suspended line; no
  faked chat. Divergences documented here. ✓
- **Accessibility (WCAG 2.2 AA).** Accordions are real `<button aria-expanded>` disclosures with a
  rotating chevron; action rows are full-row links ≥ 56–64 px targets; the actions section has an
  sr-only heading; dot + word (colour never the only signal). ✓
- **Loading / error.** Strip shows a skeleton while customer360 loads and simply omits on error
  (the rest of the page — actions + help topics — is static and always useful). ✓
- **Layout / density.** Two rows instead of a sparse 4-up grid; topics in a single flush card;
  self-service above (absent) contact. ✓
- **Worst-day user.** A suspended line sees an honest red "service suspended"; "My top-up was not
  credited" is the first topic and explains the 30-minute window + refund time without needing a
  human. ✓

Regression: a Support step was added to `docs/design/roteiro-captura.json` (open the Support tab,
assert "Help topics"), so the screen is covered by the versioned capture.

---

## Cross-references
- Top-up decisions & debt: `docs/design/2026-11-13-topup-flow-decisions-debt.md`
- Voucher decisions & debt: `docs/design/2026-11-13-voucher-flow-decisions-debt.md`
- Security & tenancy debt: `docs/design/2026-11-11-fase8-security-debt.md`
