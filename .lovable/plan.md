# Review and reorder the onboarding steps

## Today's order
```text
Welcome -> Plan -> SIM type -> Extras -> Number -> Account -> Delivery (physical only) -> Review -> Success
```

### What's wrong with it
1. **Extras come too early.** They're an upsell shown before the person has a number or an account. Prepaid buyers want to finish fast, so asking "boost your plan?" mid-flow slows them down and can feel pushy.
2. **The fun moment comes late.** Picking a number is when the line starts to feel like *mine*. Today it's step 5.
3. **SIM type and delivery are far apart.** The SIM choice is what decides whether we need an address, yet three steps sit between them.
4. **Two Back buttons skip a step:**
   - Back on Extras jumps to Plan and skips SIM type.
   - Back on Review jumps to Account and skips Delivery for physical SIM buyers.

## Proposed order
```text
Welcome -> Plan -> Number -> Account -> SIM type -> Delivery (physical only) -> Review (+ optional extras) -> Success
```
- **Plan, then Number:** choose what you get, then make it yours.
- **Account:** name, email and password, once the person is committed.
- **SIM type, then Delivery:** the choice and what it means are now side by side, and the eSIM path just skips Delivery.
- **Extras move into Review** as an optional "Add extras" section with "Add" buttons, so there's one less step. Nobody has to skip anything, and the total updates in place.
- The flow gets 1 step shorter: 6 steps for eSIM and 7 for physical, not counting Welcome and Success.
- Every Back button goes to the actual previous step, Delivery included.

## Technical notes
- Update `ONBOARDING_STEPS` order, remove `addons` as a route step, and redirect `/onboarding/addons` to `/onboarding/review` so old links keep working.
- Update the step guard (`firstIncompleteStep`) to the new order: plan -> number -> account -> sim -> delivery -> review.
- The step-counter total becomes stable after the SIM step. Before that, keep the "Step N" label with no total.
- Back/Continue targets come from one helper based on the step order and SIM type, so they can't drift again.
- Review gets an extras section reusing the existing add-on list and selection state. The payment total includes the chosen extras.
- Tests: the guard order, the Back target for each step (physical and eSIM), the old addons link redirecting, and the total including extras.
- Text for the new Review section in English and German.
