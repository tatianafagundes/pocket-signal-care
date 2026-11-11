import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-8 pb-32">
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>
      <div className="mt-8 rounded-3xl border border-dashed border-border bg-card p-10 shadow-soft">{children}</div>
    </main>
  );
}
