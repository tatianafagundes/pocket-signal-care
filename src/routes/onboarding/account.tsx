import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import { SeamErrorNotice } from "@/components/onboarding/seam-error-notice";
import { PasswordChecklist } from "@/components/onboarding/password-checklist";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, SeamFailure } from "@/services/api";
import { buildAccountFormSchema, type AccountFormValues } from "@/schemas/account-form";
import { PasswordInput } from "@/components/onboarding/password-input";

export const Route = createFileRoute("/onboarding/account")({
  head: () => ({
    meta: [
      { title: "Create your account — whitelabel" },
      { name: "description", content: "Create the account that secures your prepaid service." },
      { property: "og:title", content: "Create your account — whitelabel" },
      {
        property: "og:description",
        content: "Create the account that secures your prepaid service.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("account");

  // SeamFailure surfaced from register (e.g. emailInUse). Form-field errors are handled by RHF.
  const [seamError, setSeamError] = useState<SeamFailure | null>(null);

  // Name + email + password in one step. Memoised on `t` so messages follow the locale.
  const schema = useMemo(
    () =>
      buildAccountFormSchema({
        givenNameRequired: t("onboarding.details.givenNameRequired", "Enter your first name."),
        familyNameRequired: t("onboarding.details.familyNameRequired", "Enter your last name."),
        emailInvalid: t("onboarding.account.emailInvalid", "Enter a valid email address."),
        passwordWeak: t(
          "onboarding.account.passwordWeak",
          "Your password doesn't meet the requirements yet.",
        ),
        confirmMismatch: t("onboarding.account.confirmMismatch", "The passwords don't match."),
      }),
    [t],
  );

  type Values = AccountFormValues;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      givenName: state.givenName ?? "",
      familyName: state.familyName ?? "",
      email: state.email ?? "",
      password: "",
      confirm: "",
    },
    mode: "onBlur",
  });

  const passwordValue = form.watch("password");

  async function onSubmit(values: Values) {
    setSeamError(null);
    try {
      // The password is passed to the seam and NEVER persisted: only the email goes to context.
      await api.register({
        tenantId: tenant,
        email: values.email,
        password: values.password,
      });
      patch({
        email: values.email,
        givenName: values.givenName.trim(),
        familyName: values.familyName.trim(),
      });
      await navigate({ to: "/onboarding/review" });
    } catch (err) {
      if (err instanceof SeamFailure) {
        setSeamError(err);
      } else {
        throw err;
      }
    }
  }

  return (
    <WizardPage
      step="account"
      title={t("onboarding.account.title", "Create your account")}
      subtitle={t(
        "onboarding.account.subtitle",
        "Your name, email and a password set up your profile and keep your service safe.",
      )}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {/* emailInUse is a conflict (not retryable): the notice shows the mapped copy, no retry. */}
          {seamError ? <SeamErrorNotice error={seamError} /> : null}

          {(["givenName", "familyName"] as const).map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {name === "givenName"
                      ? t("onboarding.details.givenName", "First name")
                      : t("onboarding.details.familyName", "Last name")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      autoComplete={name === "givenName" ? "given-name" : "family-name"}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("onboarding.account.email", "Email")}</FormLabel>
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
                <FormLabel>{t("onboarding.account.password", "Password")}</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    aria-describedby="pw-checklist"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <PasswordChecklist id="pw-checklist" password={passwordValue} />

          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("onboarding.account.confirm", "Confirm password")}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <WizardNav
            onBack={() => navigate({ to: "/onboarding/number" })}
            continueType="submit"
            busy={form.formState.isSubmitting}
          />
        </form>
      </Form>
    </WizardPage>
  );
}
