import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Button } from "@/components/ui/button";
import { AssistQuestionView } from "@/components/onboarding/assist-question";
import { AssistResult } from "@/components/onboarding/assist-result";
import { ASSIST_QUESTIONS, toAssistAnswers, type AssistDraft } from "@/lib/assist-questions";
import { recommend, type Recommendation } from "@/services/recommendation-rules";
import type { Offer } from "@/services/model";

/*
 * AssistPanel (Fuon). The optional "help me choose" flow on the plan screen. (Spec Fase 5 / Req 3)
 *
 * Four everyday questions, ONE at a time (tap to answer and advance), then the PURE
 * `recommend()` rule — never an LLM — suggests ONE plan with the estimate and reason behind it.
 * It is optional and non-blocking: a teaser card opens it, "Not now" closes it, and after
 * choosing it collapses to a one-line summary so the plan grid stays in view.
 *
 * Focus moves to each new question / the result heading, so screen readers follow the flow.
 */

type View = "teaser" | "asking" | "result" | "summary";

interface AssistPanelProps {
  offers: Offer[];
  /** Called when the customer chooses a plan from the result. */
  onChoose: (offerId: string) => void;
  /** Called with the current suggestion (or null when answers are reset). */
  onSuggestion: (rec: Recommendation | null) => void;
}

export function AssistPanel({ offers, onChoose, onSuggestion }: AssistPanelProps) {
  const { t } = useLocalizedTranslation();
  const [view, setView] = useState<View>("teaser");
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<AssistDraft>({});
  const [result, setResult] = useState<Recommendation | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [view, index]);

  function go(next: View, nextIndex = index) {
    moveFocus.current = next === "asking" || next === "result";
    setView(next);
    setIndex(nextIndex);
  }

  function answer(option: string) {
    const question = ASSIST_QUESTIONS[index];
    if (!question) return;
    const nextDraft = { ...draft, [question.key]: option };
    setDraft(nextDraft);
    if (index < ASSIST_QUESTIONS.length - 1) {
      go("asking", index + 1);
      return;
    }
    const answers = toAssistAnswers(nextDraft);
    const rec = answers ? recommend(answers, offers) : null;
    setResult(rec);
    onSuggestion(rec);
    go(rec ? "result" : "teaser", 0);
  }

  function back() {
    if (index === 0) go("teaser", 0);
    else go("asking", index - 1);
  }

  function restart() {
    setResult(null);
    onSuggestion(null);
    go("asking", 0);
  }

  function choose(offerId: string) {
    setView("summary");
    onChoose(offerId);
  }

  const question = ASSIST_QUESTIONS[index];
  const chosen = result ? offers.find((o) => o.offerId === result.offerId) : undefined;

  if (view === "teaser") {
    return (
      <section className="flex items-start gap-3 rounded-card border border-hairline bg-surface-tint p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="type-body font-medium text-text-primary">
            {t("onboarding.plan.assist.teaserTitle", "Not sure which plan?")}
          </h2>
          <p className="mt-1 type-caption text-text-secondary">
            {t(
              "onboarding.plan.assist.teaserBody",
              "Answer 4 quick questions and we'll suggest one. It takes under a minute.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => go("asking", 0)}
          >
            {t("onboarding.plan.assist.open", "Help me choose")}
          </Button>
        </div>
      </section>
    );
  }

  if (view === "summary" && result && chosen) {
    return (
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-surface-tint px-4 py-3">
        <p className="min-w-0 flex-1 type-caption text-text-primary">
          {t(
            "onboarding.plan.assist.summary",
            "Suggested for you: {{plan}}, based on about {{gb}} GB a month.",
            { plan: chosen.name, gb: result.estimateGb },
          )}
        </p>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-11 px-0 text-accent-ink"
          onClick={restart}
        >
          {t("onboarding.plan.assist.restart", "Change answers")}
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label={t("onboarding.plan.assist.open", "Help me choose")}
      className="rounded-card border border-hairline bg-surface-tint p-4"
    >
      {view === "result" && result ? (
        <AssistResult
          ref={headingRef}
          result={result}
          offers={offers}
          onChoose={choose}
          onRestart={restart}
        />
      ) : question ? (
        <>
          <AssistQuestionView
            ref={headingRef}
            question={question}
            index={index}
            total={ASSIST_QUESTIONS.length}
            value={draft[question.key]}
            onAnswer={answer}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" className="min-h-11" onClick={back}>
              {t("onboarding.plan.assist.back", "Back")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => go("teaser", 0)}
            >
              {t("onboarding.plan.assist.close", "Not now")}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
