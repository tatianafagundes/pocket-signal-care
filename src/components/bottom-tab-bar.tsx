import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Home, Smartphone, Wallet, PackagePlus, User, LifeBuoy } from "lucide-react";

// Fallbacks match the en-US default locale and the fixed DESIGN.md tab set.
// "Top up" is the one prepaid term — never "Recharge".
const TABS = [
  { to: "/", key: "nav.home", fallback: "Home", icon: Home },
  { to: "/my-plan", key: "nav.myPlan", fallback: "My plan", icon: Smartphone },
  { to: "/top-up", key: "nav.topUp", fallback: "Top up", icon: Wallet },
  { to: "/add-ons", key: "nav.addOns", fallback: "Add-ons", icon: PackagePlus },
  { to: "/account", key: "nav.account", fallback: "Account", icon: User },
  { to: "/support", key: "nav.support", fallback: "Support", icon: LifeBuoy },
] as const;

export function BottomTabBar() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-3xl grid-cols-6">
        {TABS.map(({ to, key, fallback, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: true }}
              className="group flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-primary sm:text-xs"
            >
              <span className="flex h-8 w-12 items-center justify-center rounded-full transition-colors group-data-[status=active]:bg-accent">
                <Icon className="h-5 w-5" />
              </span>
              <span className="truncate">{t(key, fallback)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
