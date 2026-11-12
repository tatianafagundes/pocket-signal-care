import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { stepBefore, TENANT_OFFERS_ESIM } from "@/lib/onboarding-context";
import { continueTarget } from "@/lib/onboarding-guard";
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
import {
  buildAccountEditSchema,
  buildAccountFormSchema,
  type AccountFormValues,
} from "@/schemas/account-form";
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

  // Once the account exists (registered earlier in this flow), this step only edits name/email:
  // no password, and no second register call (which would fail with "email already in use").
  const accountExists = state.registeredEmail != null;

  // Name + email + password in one step. Memoised on `t` so messages follow the locale.
  const schema = useMemo(() => {
    const messages = {
      givenNameRequired: t("onboarding.details.givenNameRequired", "Enter your first name."),
      familyNameRequired: t("onboarding.details.familyNameRequired", "Enter your last name."),
      emailInvalid: t("onboarding.account.emailInvalid", "Enter a valid email address."),
      passwordWeak: t(
        "onboarding.account.passwordWeak",
        "Your password doesn't meet the requirements yet.",
      ),
      confirmMismatch: t("onboarding.account.confirmMismatch", "The passwords don't match."),
    };
    return accountExists ? buildAccountEditSchema(messages) : buildAccountFormSchema(messages);
  }, [t, accountExists]);

  const form = useForm<AccountFormValues>({
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

  const target = (s: typeof state) => continueTarget("account", s, TENANT_OFFERS_ESIM);
  const returnsToReview = accountExists && target(state).returnsToReview;

  async function onSubmit(values: AccountFormValues) {
    setSeamError(null);
    const email = values.email.trim();
    try {
      if (state.registeredEmail == null) {
        // The password is passed to the seam and NEVER persisted: only the email goes to context.
        await api.register({ tenantId: tenant, email, password: values.password });
      } else if (email.toLowerCase() !== state.registeredEmail.toLowerCase()) {
        // Account already exists: move it to the new email instead of registering again.
        await api.changeEmail({
          tenantId: tenant,
          currentEmail: state.registeredEmail,
          newEmail: email,
        });
      }
      const update = {
        email,
        registeredEmail: email,
        givenName: values.givenName.trim(),
        familyName: values.familyName.trim(),
      };
      patch(update);
      await navigate({ to: `/onboarding/${target({ ...state, ...update }).to}` });
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
      title={
        accountExists
          ? t("onboarding.account.editTitle", "Your details")
          : t("onboarding.account.title", "Create your account")
      }
      subtitle={
        accountExists
          ? t(
              "onboarding.account.editSubtitle",
              "Check your name and email — this is how we reach you.",
            )
          : t(
              "onboarding.account.subtitle",
              "Your name, email and a password set up your profile and keep your service safe.",
            )
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {/* emailInUse is a conflict (not retryable): the notice shows the mapped copy, no retry. */}
          {seamError ? <SeamErrorNotice error={seamError} /> : null}

          {accountExists ? (
            <p className="rounded-card bg-accent-tint p-3 type-caption text-accent-ink">
              {t(
                "onboarding.account.editNote",
                "Your account is already set up. You can update your name or email here — your password stays the same.",
              )}
            </p>
          ) : null}

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

          {accountExists ? null : (
            <>
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
            </>
          )}

          <WizardNav
            onBack={() =>
              navigate({
                to: `/onboarding/${stepBefore("account", { offersEsim: TENANT_OFFERS_ESIM, simType: state.simType })}`,
              })
            }
            continueType="submit"
            {...(returnsToReview
              ? { continueLabel: t("onboarding.nav.returnToReview", "Save and return to review") }
              : {})}
            busy={form.formState.isSubmitting}
          />
        </form>
      </Form>
    </WizardPage>
  );
}
