import type { AssistAnswers } from "@/services/recommendation-rules";

/*
 * The "help me choose" questions, in order. Each option's label and hint live in the locale
 * files under `onboarding.plan.assist.q.<question>.<option>`; this module only fixes the order
 * and maps each option to the answer the pure `recommend()` rule reads.
 */
export type AssistQuestionKey = "video" | "social" | "hotspot" | "travel";

export interface AssistQuestion {
  key: AssistQuestionKey;
  options: readonly string[];
}

export const ASSIST_QUESTIONS: readonly AssistQuestion[] = [
  { key: "video", options: ["rarely", "daily", "hours"] },
  { key: "social", options: ["messages", "some", "lots"] },
  { key: "hotspot", options: ["never", "sometimes", "often"] },
  { key: "travel", options: ["no", "yes"] },
] as const;

export type AssistDraft = Partial<Record<AssistQuestionKey, string>>;

/** The rule's answers once every question has one, else null. */
export function toAssistAnswers(draft: AssistDraft): AssistAnswers | null {
  const { video, social, hotspot, travel } = draft;
  if (
    (video !== "rarely" && video !== "daily" && video !== "hours") ||
    (social !== "messages" && social !== "some" && social !== "lots") ||
    (hotspot !== "never" && hotspot !== "sometimes" && hotspot !== "often") ||
    (travel !== "yes" && travel !== "no")
  ) {
    return null;
  }
  return { video, social, hotspot, travelsEu: travel === "yes" };
}
