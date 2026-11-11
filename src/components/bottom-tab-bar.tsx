import { Link } from "@tanstack/react-router";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { Home, Smartphone, Wallet, PackagePlus, User, LifeBuoy } from "lucide-react";

/*
 * Bottom tab bar (Fuon). (Spec Fase 2.3)
 *
 * The prepaid six: Home · My plan · Top up · Add-ons · Account · Support (DESIGN.md fixed set).
 * Active tab = accent-ink label + icon, with an accent-tint pill behind the icon (the Fuon
 * selected treatment — not colour alone: it's also the current route). Inactive = text-secondary.
 * Surface background, 1px hairline on top, type-tab-label, inside the 390px phone column.
 * Fallbacks match the en-US default; "Top up" is the one prepaid term (never "Recharge").
 */
const TABS = [
  { to: "/", key: "nav.home", fallback: "Home", icon: Home },
  { to: "/my-plan", key: "nav.myPlan", fallback: "My plan", icon: Smartphone },
  { to: "/top-up", key: "nav.topUp", fallback: "Top up", icon: Wallet },
  { to: "/add-ons", key: "nav.addOns", fallback: "Add-ons", icon: PackagePlus },
  { to: "/account", key: "nav.account", fallback: "Account", icon: User },
  { to: "/support", key: "nav.support", fallback: "Support", icon: LifeBuoy },
] as const;

export function BottomTabBar() {
  const { t } = useLocalizedTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid w-full max-w-[390px] grid-cols-6">
        {TABS.map(({ to, key, fallback, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="group flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 type-tab-label text-text-secondary transition-colors hover:text-text-primary data-[status=active]:text-accent-ink"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-pill transition-colors group-data-[status=active]:bg-accent-tint">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="truncate">{t(key, fallback)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
