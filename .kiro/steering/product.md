---
inclusion: always
---

# Product — what this app is and why

A **prepaid mobile self-care PWA**, white-labelled across two brands: **Drei** (the host MNO) and
**DreiGo** (a fictional MVNO on Drei's network). A customer manages their own prepaid line: see
balance and usage, top up, buy add-ons, onboard a new line, manage their plan.

It is a **demo/reference** app for the DXP (Digital Experience Platform) stack. Every backend is
mocked behind a seam today; **CPR** (Customer/Party Repository) is the only system intended to go
real first. The point is to show a faithful, contract-accurate self-care experience that a real
DXP deployment could stand behind — so faithfulness to the TMF/DXP contracts matters more than
feature count.

Who it serves: a prepaid subscriber (self-care), not a CSR. The 360 view here is the
customer-facing subset, not the full CSR dashboard.

## Non-negotiables (the product's character)
- **Honesty over completeness.** Never show a number, CTA, or capability the system can't actually
  back. If a tenant has no roaming add-on, don't offer one. If a value isn't known, don't invent it.
- **Two brands, one codebase.** A brand is a theme (`<html data-brand>`), never a code fork.
- **Bilingual.** en-US (default) + de-AT, full parity, zero hardcoded UI strings.
- **Graceful degradation.** A failed sub-system shows an empty/neutral state, never a blanked or
  crashed screen.

## Where the detail lives (read these, don't duplicate them)
- Project rules (design tokens, i18n, tenant, build): #[[file:AGENTS.md]]
- Design system: #[[file:design/DESIGN.md]]
- What has shipped, phase by phase: #[[file:docs/PHASES.md]]
- The real systems each seam stands in for: #[[file:docs/contracts/README.md]]
