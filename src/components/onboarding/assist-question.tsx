import { forwardRef } from "react";
import { Check } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import type { AssistQuestion } from "@/lib/assist-questions";

/*
 * One "help me choose" question. Each option is a full-width button: tapping it records the
 * answer and the parent advances, so there is no separate "Next". Buttons (not radios) on
 * purpose — arrow keys on a radio group would change the answer and auto-advance by accident.
 * A previously chosen answer stays marked (check + aria-pressed) when the user goes back.
 */
interface AssistQuestionProps {
  question: AssistQuestion;
  index: number;
  total: number;
  value: string | undefined;
  onAnswer: (option: string) => void;
}

export const AssistQuestionView = forwardRef<HTMLHeadingElement, AssistQuestionProps>(
  function AssistQuestionView({ question, index, total, value, onAnswer }, headingRef) {
    const { t } = useLocalizedTranslation();
    const base = `onboarding.plan.assist.q.${question.key}`;
    const hint = t(`${base}.hint`, "");

    return (
      <div>
        <p className="type-caption text-text-secondary">
          {t("onboarding.plan.assist.progress", "Question {{current}} of {{total}}", {
            current: index + 1,
            total,
          })}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={
                "h-1 flex-1 rounded-pill " + (i <= index ? "bg-accent-ink" : "bg-hairline")
              }
            />
          ))}
        </div>

        <h3
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 type-heading text-text-primary outline-none"
        >
          {t(`${base}.title`, question.key)}
        </h3>
        {hint ? <p className="mt-1 type-caption text-text-secondary">{hint}</p> : null}

        <div className="mt-4 grid gap-2">
          {question.options.map((option) => {
            const active = value === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => onAnswer(option)}
                className={
                  "focus-ring flex min-h-14 w-full items-center gap-3 rounded-control border bg-surface px-4 py-3 text-left transition-colors hover:border-accent-ink " +
                  (active
                    ? "border-accent-ink outline outline-1 outline-accent-ink"
                    : "border-hairline")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block type-body font-medium text-text-primary">
                    {t(`${base}.${option}.label`, option)}
                  </span>
                  <span className="mt-0.5 block type-caption text-text-secondary">
                    {t(`${base}.${option}.hint`, "")}
                  </span>
                </span>
                {active ? (
                  <Check className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
