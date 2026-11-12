import type { ReactNode } from "react";

/*
 * PageShell (Fuon). The page frame every route renders into: the 390px phone column, with
 * room for the sticky app-bar above and the fixed tab bar below. Title = type-title,
 * subtitle = body on text-secondary. The content area is a surface card — 1px hairline,
 * 12px radius, NO shadow (Fuon: depth is hairline + surface, never a drop shadow). The old
 * desktop width, dashed border, rounded-3xl and shadow-soft are gone.
 */
interface PageShellProps {
  title: string;
  /** Optional supporting line under the title. Omit on screens that have only a heading (Home). */
  subtitle?: string;
  /**
   * When true, render children directly on the canvas instead of inside a single surface card.
   * Use for multi-card screens (the Home dashboard: balance card + grid + rows are each their own
   * surface) — a card-inside-a-card would fight the flat model. Default false keeps every existing
   * single-card screen unchanged.
   */
  flush?: boolean;
  children?: ReactNode;
}

export function PageShell({ title, subtitle, flush = false, children }: PageShellProps) {
  return (
    <main className="mx-auto w-full max-w-[390px] px-5 pt-6 pb-28">
      <h1 className="type-title text-text-primary">{title}</h1>
      {subtitle ? <p className="type-body mt-1 text-text-secondary">{subtitle}</p> : null}
      {flush ? (
        <div className="mt-6">{children}</div>
      ) : (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-5">{children}</div>
      )}
    </main>
  );
}
