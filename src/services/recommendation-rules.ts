import type { Offer } from "@/services/model";

/*
 * Recommendation assist — a PURE rule. (Spec Fase 5 / onboarding-journey Req 3)
 *
 * The optional "help me choose" step asks 2–3 behavioural questions and suggests ONE plan. This
 * is a deterministic rule (NOT an LLM): transparent, testable, and it labels its output as a
 * suggestion, never "the best plan". Same input/output shape as the DXP Next Best Offer would
 * have (TMF679 alternateProposal), so the UI doesn't change when a real recommender replaces it
 * (see docs/contracts/tmf679-po-qualification.md). No I/O, no throw.
 *
 * It reads offer `category`/fields — never hardcoded offer ids — so it works for any tenant and
 * survives a catalogue change.
 */

/** Behavioural answers. `null` = not answered (the step is optional and can be partial). */
export interface AssistAnswers {
  /** "Do you watch video on your phone?" */
  watchesVideo: boolean | null;
  /** "Do you travel in the EU?" */
  travelsEu: boolean | null;
  /** "Do you use a lot of apps / social media?" (optional third question) */
  heavyApps: boolean | null;
}

/** i18n key explaining why a plan was suggested — the UI shows it, never a hardcoded phrase. */
export type ReasonCode =
  | "assist.reason.videoAndTravel"
  | "assist.reason.video"
  | "assist.reason.heavyApps"
  | "assist.reason.light"
  | "assist.reason.default";

export interface Recommendation {
  offerId: string;
  reason: ReasonCode;
  /** Always "suggested" — this is help, not a decision. Never "best". */
  confidence: "suggested";
}

/** The plan tier the answers point to, mapped to an Offer.category. */
type Tier = "starter" | "standard" | "unlimited";

function tierFor(answers: AssistAnswers): { tier: Tier; reason: ReasonCode } {
  const video = answers.watchesVideo === true;
  const travel = answers.travelsEu === true;
  const heavy = answers.heavyApps === true;

  if (video && travel) return { tier: "unlimited", reason: "assist.reason.videoAndTravel" };
  if (video) return { tier: "standard", reason: "assist.reason.video" };
  if (heavy) return { tier: "standard", reason: "assist.reason.heavyApps" };
  return { tier: "starter", reason: "assist.reason.light" };
}

/** The tenant's recommended plan, else the first plan — the fallback when no tier matches. */
function fallbackOffer(plans: Offer[]): Offer | undefined {
  return plans.find((o) => o.recommended === true) ?? plans[0];
}

/**
 * Suggest one plan from the given offers for the given answers. `offers` should be the plan grid
 * (the caller passes what `listOffers` returned). Returns the fallback recommendation when no
 * plan matches the chosen tier, so the result is always a real offer the grid contains.
 */
export function recommend(answers: AssistAnswers, offers: Offer[]): Recommendation | null {
  // Only consider plans, never add-ons. Positive test (kind absent or "plan") so a future
  // non-plan kind is excluded by default rather than slipping into a suggestion.
  const plans = offers.filter((o) => o.kind == null || o.kind === "plan");
  if (plans.length === 0) return null;

  const { tier, reason } = tierFor(answers);
  const match = plans.find((o) => o.category === tier);
  if (match) {
    return { offerId: match.offerId, reason, confidence: "suggested" };
  }

  const fallback = fallbackOffer(plans);
  if (!fallback) return null;
  return { offerId: fallback.offerId, reason: "assist.reason.default", confidence: "suggested" };
}
