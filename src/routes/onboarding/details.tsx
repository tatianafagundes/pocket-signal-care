import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/onboarding/details")({
  head: () => ({
    meta: [
      { title: "Your details — whitelabel" },
      { name: "description", content: "Tell us your name to personalize your account." },
      { property: "og:title", content: "Your details — whitelabel" },
      { property: "og:description", content: "Tell us your name to personalize your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetailsPage,
});

function DetailsPage() {
  const { t } = useLocalizedTranslation();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("details");

  const schema = z.object({
    givenName: z
      .string()
      .trim()
      .min(1, t("onboarding.details.givenNameRequired", "Enter your first name.")),
    familyName: z
      .string()
      .trim()
      .min(1, t("onboarding.details.familyNameRequired", "Enter your last name.")),
  });

  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { givenName: state.givenName ?? "", familyName: state.familyName ?? "" },
    mode: "onBlur",
  });

  function onSubmit(values: Values) {
    patch({ givenName: values.givenName, familyName: values.familyName });
    void navigate({ to: "/onboarding/number" });
  }

  return (
    <WizardPage
      step="details"
      title={t("onboarding.details.title", "Your details")}
      subtitle={t(
        "onboarding.details.subtitle",
        "Just your name — we'll use it to set up your profile.",
      )}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <FormField
            control={form.control}
            name="givenName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("onboarding.details.givenName", "First name")}</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="familyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("onboarding.details.familyName", "Last name")}</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <WizardNav onBack={() => navigate({ to: "/onboarding/account" })} continueType="submit" />
        </form>
      </Form>
    </WizardPage>
  );
}
