import type { Offer } from "@/services/model";

/*
 * Recommendation assist — a PURE rule. (Spec Fase 5 / onboarding-journey Req 3)
 *
 * The optional "help me choose" flow asks four everyday questions, turns them into an estimated
 * monthly data use (GB), and suggests ONE plan: the cheapest plan whose allowance covers the
 * estimate (with EU roaming when the customer travels). It is deterministic (NOT an LLM):
 * transparent, testable, and labelled a suggestion, never "the best plan". Same input/output
 * shape a DXP Next Best Offer would have (TMF679 alternateProposal), so the UI doesn't change
 * when a real recommender replaces it. No I/O, no throw.
 *
 * It reads offer fields (`dataAmount`, `unlimitedData`, `euRoaming`, `priceMinor`) — never
 * hardcoded offer ids — so it works for any tenant and survives a catalogue change.
 */

export type VideoUse = "rarely" | "daily" | "hours";
export type SocialUse = "messages" | "some" | "lots";
export type HotspotUse = "never" | "sometimes" | "often";

/** Behavioural answers; every question has a plain-language option, so all are required. */
export interface AssistAnswers {
  /** "On mobile data, how much video do you watch?" */
  video: VideoUse;
  /** "How much social media and music, away from Wi-Fi?" */
  social: SocialUse;
  /** "Do you share your phone's internet with a laptop or tablet?" */
  hotspot: HotspotUse;
  /** "Will you use your phone in other EU countries?" */
  travelsEu: boolean;
}

/*
 * Monthly GB per answer. Placeholder calibration (≈1 GB per hour of mobile video, ~30 min/day
 * for "daily"); a real usage model can replace these numbers without touching the UI.
 */
export const USAGE_GB = {
  base: 0.5,
  video: { rarely: 0.5, daily: 8, hours: 35 },
  social: { messages: 1, some: 4, lots: 10 },
  hotspot: { never: 0, sometimes: 4, often: 15 },
} as const;

/** Share of an allowance above which a fit is "close" (the UI mentions adding data). */
const CLOSE_FIT_RATIO = 0.8;
/** A cheaper plan is worth mentioning when it covers at least this share of the estimate. */
const ALTERNATIVE_MIN_COVER = 0.6;

/** i18n key explaining why a plan was suggested — the UI shows it, never a hardcoded phrase. */
export type ReasonCode =
  | "assist.reason.fits"
  | "assist.reason.closeFit"
  | "assist.reason.unlimited"
  | "assist.reason.biggest"
  | "assist.reason.default";

export interface Recommendation {
  offerId: string;
  reason: ReasonCode;
  /** Estimated monthly data use in whole GB (rounded up). */
  estimateGb: number;
  /** True when the suggestion includes EU roaming because the customer travels. */
  includesEuRoaming: boolean;
  /** A cheaper plan that may be enough for someone often on Wi-Fi, with the monthly saving. */
  cheaperAlternative?: { offerId: string; savingMinor: number };
  /** Always "suggested" — this is help, not a decision. Never "best". */
  confidence: "suggested";
}

/** Estimated monthly data use in whole GB, rounded up. */
export function estimateMonthlyGb(answers: AssistAnswers): number {
  const total =
    USAGE_GB.base +
    USAGE_GB.video[answers.video] +
    USAGE_GB.social[answers.social] +
    USAGE_GB.hotspot[answers.hotspot];
  return Math.ceil(total);
}

/** Data allowance in GB: Infinity for unlimited, null when the label can't be read. */
export function allowanceGb(offer: Offer): number | null {
  if (offer.unlimitedData === true) return Number.POSITIVE_INFINITY;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*GB\b/i.exec(offer.dataAmount);
  if (!match?.[1]) return null;
  return Number(match[1].replace(",", "."));
}

function isPlan(o: Offer): boolean {
  // Positive test (kind absent or "plan") so a future non-plan kind is excluded by default.
  return o.kind == null || o.kind === "plan";
}

/**
 * Suggest one plan for the given answers. `offers` is the plan grid (what `listOffers` returned).
 * Always returns a real offer from that grid, or null when it has no plans.
 */
export function recommend(answers: AssistAnswers, offers: Offer[]): Recommendation | null {
  const plans = offers.filter(isPlan);
  if (plans.length === 0) return null;

  const estimateGb = estimateMonthlyGb(answers);
  const roaming = plans.filter((o) => o.euRoaming === true);
  // Travelling narrows to roaming plans; if the tenant has none, fall back to every plan.
  const eligible = answers.travelsEu && roaming.length > 0 ? roaming : plans;
  const sized = eligible
    .map((offer) => ({ offer, gb: allowanceGb(offer) }))
    .filter((p): p is { offer: Offer; gb: number } => p.gb != null)
    .sort((a, b) => a.offer.priceMinor - b.offer.priceMinor);

  const base = { estimateGb, confidence: "suggested" as const };

  if (sized.length === 0) {
    const fallback = eligible.find((o) => o.recommended === true) ?? eligible[0];
    if (!fallback) return null;
    return {
      ...base,
      offerId: fallback.offerId,
      reason: "assist.reason.default",
      includesEuRoaming: answers.travelsEu && fallback.euRoaming === true,
    };
  }

  const fitIndex = sized.findIndex((p) => p.gb >= estimateGb);
  if (fitIndex === -1) {
    // More than any plan covers: suggest the largest allowance (ties → cheaper).
    const biggest = sized.reduce((a, b) => (b.gb > a.gb ? b : a));
    return {
      ...base,
      offerId: biggest.offer.offerId,
      reason: "assist.reason.biggest",
      includesEuRoaming: answers.travelsEu && biggest.offer.euRoaming === true,
    };
  }

  const fit = sized[fitIndex]!;
  const reason: ReasonCode = !Number.isFinite(fit.gb)
    ? "assist.reason.unlimited"
    : estimateGb > fit.gb * CLOSE_FIT_RATIO
      ? "assist.reason.closeFit"
      : "assist.reason.fits";

  // The nearest cheaper plan that still covers most of the estimate (honest budget hint).
  const cheaper = sized
    .slice(0, fitIndex)
    .reverse()
    .find(
      (p) =>
        p.offer.priceMinor < fit.offer.priceMinor && p.gb >= estimateGb * ALTERNATIVE_MIN_COVER,
    );

  return {
    ...base,
    offerId: fit.offer.offerId,
    reason,
    includesEuRoaming: answers.travelsEu && fit.offer.euRoaming === true,
    ...(cheaper
      ? {
          cheaperAlternative: {
            offerId: cheaper.offer.offerId,
            savingMinor: fit.offer.priceMinor - cheaper.offer.priceMinor,
          },
        }
      : {}),
  };
}
