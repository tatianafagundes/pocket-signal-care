import { User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useTenant } from "@/hooks/use-tenant";
import { useSession } from "@/hooks/use-session";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { LanguageSelector } from "@/components/language-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tenantLogo } from "@/lib/tenant-rules";

/*
 * App bar (Fuon). (Spec Fase 2.3)
 *
 * A white app-bar with a 1px hairline under it — no coloured band, no gradient. The brand logo
 * is the ONLY place the mark renders. It sits directly on the white app-bar (like drei.at,
 * where the "3" mark sits on white), NOT inside a coloured tile — so the logo reads on its own
 * and we don't put brand chrome behind it. The logo + alt come from the active tenant
 * (tenantLogo / tenantName). Right side: the language selector. 390px phone column.
 *
 * Assets live in /public/brands (Drei = official "3" mark; DreiGo = placeholder until a real
 * asset exists). Height-constrained; width auto so any wordmark keeps its aspect ratio.
 */
export function AppHeader() {
  const { tenant, tenantName } = useTenant();
  const { session, signOut } = useSession();
  const { t } = useLocalizedTranslation();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[390px] items-center justify-between px-5">
        <img
          src={tenantLogo(tenant)}
          alt={tenantName}
          className="h-8 w-auto"
          // The logo is the accessible brand name; decorative wrapper not needed.
        />
        <div className="flex items-center gap-1">
          <LanguageSelector />
          {/* The account menu appears only when signed in. Its distinct value over the Account
              tab is Sign out; the tab is the route to the account screen. */}
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("account.menuLabel", "Account menu")}
                className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill text-text-secondary hover:text-text-primary"
              >
                <User className="size-5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="max-w-[240px] truncate">
                  {t("account.signedInAs", "Signed in as {{email}}", { email: session.email })}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    signOut();
                    void navigate({ to: "/" });
                  }}
                >
                  {t("account.signOut", "Sign out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
