import { useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { scorePassword } from "@/services/auth-rules";
import type { PasswordStrength } from "@/services/model";

/*
 * PasswordChecklist (Fuon). Live password-strength feedback. (Spec Fase 5 / Req 4; WCAG 1.4.1, 4.1.3)
 *
 * Renders one line per criterion (min length, upper, lower, number) with an ICON + WORD, so the
 * met/unmet state is never conveyed by colour alone. It derives the score from `scorePassword`
 * (the same pure rule the seam validates with), so the UI and the backend agree on what "strong"
 * means.
 *
 * ANNOUNCEMENT (review V5): a screen reader must NOT hear all four criteria on every keystroke.
 * The aria-live region announces ONLY the criteria that just flipped met/unmet since the previous
 * value — the transition, not the state — so typing one character announces at most the one
 * criterion it satisfied, not a wall of text.
 */

const CRITERIA: (keyof Omit<PasswordStrength, "ok">)[] = [
  "minLength",
  "hasUpper",
  "hasLower",
  "hasNumber",
];

interface PasswordChecklistProps {
  password: string;
  /** Wire this to the field's id so the checklist is referenced via aria-describedby. */
  id?: string;
}

export function PasswordChecklist({ password, id }: PasswordChecklistProps) {
  const { t } = useLocalizedTranslation();
  const score = scorePassword(password);
  const prevRef = useRef<PasswordStrength | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const prev = prevRef.current;
    if (prev) {
      // Announce only the criteria whose met/unmet state changed since last time.
      const changed = CRITERIA.filter((c) => prev[c] !== score[c]).map((c) => {
        const met = score[c]
          ? t("onboarding.account.strength.met", "met")
          : t("onboarding.account.strength.unmet", "not yet");
        return `${t(`onboarding.account.strength.${c}`, c)}: ${met}`;
      });
      if (changed.length > 0) setAnnounce(changed.join(". "));
    }
    prevRef.current = score;
    // score is derived from `password`; keying on password avoids re-running on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  return (
    <div id={id}>
      <p className="type-caption text-text-secondary">
        {t("onboarding.account.strength.label", "Password must have")}
      </p>
      <ul className="mt-1 grid gap-1">
        {CRITERIA.map((c) => {
          const met = score[c];
          return (
            <li key={c} className="flex items-center gap-2 type-caption">
              {met ? (
                // met = check; unmet = dash (a "pending" marker, not a hollow circle that reads
                // as a selectable radio). State also carries in the text weight below.
                <Check className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
              )}
              <span className={met ? "text-text-primary" : "text-text-secondary"}>
                {t(`onboarding.account.strength.${c}`, c)}
              </span>
            </li>
          );
        })}
      </ul>
      {/* Transition announcements only — not the full state on every keystroke. */}
      <p className="sr-only" role="status">
        {announce}
      </p>
    </div>
  );
}
