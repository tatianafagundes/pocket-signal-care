import { useState } from "react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Button } from "@/components/ui/button";
import {
  recommend,
  type AssistAnswers,
  type Recommendation,
} from "@/services/recommendation-rules";
import type { Offer } from "@/services/model";

/*
 * AssistPanel (Fuon). The optional "help me choose" step on the plan screen. (Spec Fase 5 / Req 3)
 *
 * It asks 2–3 behavioural yes/no questions and calls the PURE `recommend()` rule — never an LLM —
 * to suggest ONE plan, labelled a suggestion ("Suggested for you"), never "the best plan". It is
 * optional and non-blocking: the user can skip it and pick any plan manually, and after a
 * suggestion they can still choose a different plan.
 *
 * It is disclosed behind a "Help me choose" toggle so it never gets in the way of someone who
 * already knows what they want. When it produces a suggestion it calls `onSuggest(offerId)` so the
 * parent selects that plan in the grid; the reason is shown here.
 */

type YesNo = "yes" | "no";
type AnswerKey = keyof AssistAnswers;

const QUESTIONS: AnswerKey[] = ["watchesVideo", "travelsEu", "heavyApps"];

interface AssistPanelProps {
  offers: Offer[];
  /** Called with the suggested offer id so the parent selects it in the grid. */
  onSuggest: (offerId: string) => void;
}

export function AssistPanel({ offers, onSuggest }: AssistPanelProps) {
  const { t } = useLocalizedTranslation();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<AnswerKey, YesNo | null>>({
    watchesVideo: null,
    travelsEu: null,
    heavyApps: null,
  });
  const [result, setResult] = useState<Recommendation | null>(null);

  function setAnswer(key: AnswerKey, value: YesNo) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function suggest() {
    const mapped: AssistAnswers = {
      watchesVideo: answers.watchesVideo === null ? null : answers.watchesVideo === "yes",
      travelsEu: answers.travelsEu === null ? null : answers.travelsEu === "yes",
      heavyApps: answers.heavyApps === null ? null : answers.heavyApps === "yes",
    };
    const rec = recommend(mapped, offers);
    if (rec) {
      setResult(rec);
      onSuggest(rec.offerId);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {t("onboarding.plan.assist.open", "Help me choose")}
      </Button>
    );
  }

  return (
    <section
      aria-label={t("onboarding.plan.assist.heading", "A few quick questions")}
      className="rounded-card border border-hairline bg-surface-tint p-4"
    >
      <h2 className="type-body font-medium text-text-primary">
        {t("onboarding.plan.assist.heading", "A few quick questions")}
      </h2>
      <p className="mt-1 type-caption text-text-secondary">
        {t(
          "onboarding.plan.assist.intro",
          "Answer what applies — we'll suggest a plan. You can still pick any plan yourself.",
        )}
      </p>

      <div className="mt-4 grid gap-4">
        {QUESTIONS.map((key) => (
          <fieldset key={key} className="grid gap-2">
            <legend className="type-caption text-text-primary">
              {t(`onboarding.plan.assist.q.${key}`, key)}
            </legend>
            {/* The fieldset+legend groups the question; the buttons are aria-pressed toggles, so
                this is NOT a role="radiogroup" (that would require role="radio" children). */}
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((value) => {
                const active = answers[key] === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    aria-pressed={active}
                    onClick={() => setAnswer(key, value)}
                  >
                    {t(`onboarding.plan.assist.${value}`, value)}
                  </Button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {result ? (
        <div className="mt-4 rounded-control bg-surface p-3" role="status">
          <p className="type-caption font-medium text-accent-ink">
            {t("onboarding.plan.assist.resultLabel", "Suggested for you")}
          </p>
          <p className="mt-1 type-caption text-text-secondary">
            {/* result.reason is the full ReasonCode "assist.reason.<leaf>"; key by the leaf. */}
            {t(`onboarding.plan.assist.reason.${result.reason.replace("assist.reason.", "")}`, "")}
          </p>
          <p className="mt-2 type-caption text-text-secondary">
            {t("onboarding.plan.assist.change", "Choose a different plan")}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("onboarding.plan.assist.skip", "Skip")}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={suggest}>
          {t("onboarding.plan.assist.suggest", "Suggest a plan")}
        </Button>
      </div>
    </section>
  );
}
