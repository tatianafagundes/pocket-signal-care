import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useTenant } from "@/hooks/use-tenant";
import { useSession } from "@/hooks/use-session";
import { fallbackCustomerId } from "@/lib/current-customer";
import { PageShell } from "@/components/page-shell";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/onboarding/password-input";
import { Button } from "@/components/ui/button";
import { api, SeamFailure } from "@/services/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — whitelabel" },
      { name: "description", content: "Sign in to manage your prepaid plan." },
      { property: "og:title", content: "Sign in — whitelabel" },
      { property: "og:description", content: "Sign in to manage your prepaid plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { setSession } = useSession();
  const navigate = useNavigate();
  const [seamError, setSeamError] = useState<SeamFailure | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("login.emailInvalid", "Enter a valid email address.")),
        password: z.string().min(1, t("login.passwordRequired", "Enter your password.")),
      }),
    [t],
  );
  type Values = { email: string; password: string };

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  async function onSubmit(values: Values) {
    setSeamError(null);
    try {
      const session = await api.login({
        tenantId: tenant,
        email: values.email,
        password: values.password,
      });
      // HONEST LIMITATION: the mock auth session carries no customerId, and there is no
      // email→customer mapping (the auth and CPR stores are deliberately disjoint). For the demo
      // we sign the user into the seeded demo customer for the tenant. A real IdP (Fase 8) returns
      // or resolves the real customerId; only this line changes then.
      setSession({
        customerId: fallbackCustomerId(tenant),
        email: session.email,
        tenantId: tenant,
        givenName: null,
        origin: session.origin,
      });
      await navigate({ to: "/my-plan" });
    } catch (err) {
      if (err instanceof SeamFailure) {
        setSeamError(err);
      } else {
        throw err;
      }
    }
  }

  return (
    <PageShell
      title={t("login.title", "Sign in")}
      subtitle={t("login.subtitle", "Welcome back — sign in to manage your plan.")}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {seamError ? <SeamErrorNotice error={seamError} /> : null}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("login.email", "Email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("login.password", "Password")}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full min-h-11"
            disabled={form.formState.isSubmitting}
            aria-busy={form.formState.isSubmitting}
          >
            {t("login.submit", "Sign in")}
          </Button>

          <p className="type-caption text-text-secondary">
            {t(
              "login.demoNote",
              "Demo: any valid email and password sign you in to the sample account.",
            )}
          </p>

          <Link
            to="/onboarding"
            className="focus-ring rounded-control type-caption text-accent-ink"
          >
            {t("login.noAccount", "New here? Create an account")}
          </Link>
        </form>
      </Form>
    </PageShell>
  );
}
