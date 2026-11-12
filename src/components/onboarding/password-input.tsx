import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Input } from "@/components/ui/input";

/** Password field with a show/hide toggle (a real button with an accessible, stateful name). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const { t } = useLocalizedTranslation();
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={`pr-12 ${className ?? ""}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={
            visible
              ? t("onboarding.account.hidePassword", "Hide password")
              : t("onboarding.account.showPassword", "Show password")
          }
          className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control text-text-secondary hover:text-text-primary"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
