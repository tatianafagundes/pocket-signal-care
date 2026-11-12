import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { stepBefore, TENANT_OFFERS_ESIM } from "@/lib/onboarding-context";
import { useLocalizedTranslation } from "@/hooks/use-localized-translation";
import { useSyncOnboardingStep } from "@/hooks/use-sync-onboarding-step";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTenant } from "@/hooks/use-tenant";
import { WizardPage } from "@/components/onboarding/wizard-page";
import { WizardNav } from "@/components/onboarding/wizard-nav";
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
import { api, SeamFailure } from "@/services/api";
import { buildDeliveryFormSchema, type DeliveryFormValues } from "@/schemas/delivery-form";

/*
 * /onboarding/delivery — shipping address for a PHYSICAL SIM. (Fase 7.5)
 *
 * Only in the flow for a physical SIM (eSIM skips it — WizardPage/guard handle that). The address
 * is validated + persisted through the logistics seam (TMF673) on Continue, so an out-of-area
 * address surfaces HERE as a recoverable error (edit + resubmit), not as a terminal failure during
 * activation. On success we persist both the address and the returned addressId — the submit
 * orchestration then reuses that addressId (its createAddress step is idempotently skipped).
 */

export const Route = createFileRoute("/onboarding/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery address — whitelabel" },
      { name: "description", content: "Where should we ship your SIM card?" },
      { property: "og:title", content: "Delivery address — whitelabel" },
      { property: "og:description", content: "Where should we ship your SIM card?" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const { t } = useLocalizedTranslation();
  const { tenant } = useTenant();
  const { state, patch } = useOnboarding();
  const navigate = useNavigate();
  useSyncOnboardingStep("delivery");

  // A recoverable seam error (addressOutsideDeliveryArea / unavailable). Field errors are RHF's.
  const [seamError, setSeamError] = useState<SeamFailure | null>(null);

  const schema = useMemo(
    () =>
      buildDeliveryFormSchema({
        line1Required: t("onboarding.delivery.line1Required", "Enter your street address."),
        cityRequired: t("onboarding.delivery.cityRequired", "Enter your city."),
        regionRequired: t("onboarding.delivery.regionRequired", "Enter your state or region."),
        postalCodeRequired: t("onboarding.delivery.postalCodeRequired", "Enter your postal code."),
        countryInvalid: t(
          "onboarding.delivery.countryInvalid",
          "Enter a 2-letter country code (e.g. AT).",
        ),
      }),
    [t],
  );

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      line1: state.deliveryAddress?.line1 ?? "",
      line2: state.deliveryAddress?.line2 ?? "",
      city: state.deliveryAddress?.city ?? "",
      region: state.deliveryAddress?.region ?? "",
      postalCode: state.deliveryAddress?.postalCode ?? "",
      country: state.deliveryAddress?.country ?? "AT",
    },
    mode: "onBlur",
  });

  async function onSubmit(values: DeliveryFormValues) {
    setSeamError(null);
    const address = {
      line1: values.line1,
      ...(values.line2 ? { line2: values.line2 } : {}),
      city: values.city,
      region: values.region,
      postalCode: values.postalCode,
      country: values.country,
    };
    try {
      // Validate + persist through the logistics seam so an out-of-area address is caught here.
      const created = await api.createAddress({ customerId: "pending", tenantId: tenant, address });
      patch({ deliveryAddress: address, addressId: created.addressId });
      await navigate({ to: "/onboarding/review" });
    } catch (err) {
      if (err instanceof SeamFailure) {
        setSeamError(err);
      } else {
        throw err;
      }
    }
  }

  const fields = [
    {
      name: "line1",
      label: t("onboarding.delivery.line1", "Street address"),
      autoComplete: "address-line1",
    },
    {
      name: "line2",
      label: t("onboarding.delivery.line2", "Apartment, suite (optional)"),
      autoComplete: "address-line2",
    },
    { name: "city", label: t("onboarding.delivery.city", "City"), autoComplete: "address-level2" },
    {
      name: "region",
      label: t("onboarding.delivery.region", "State or region"),
      autoComplete: "address-level1",
    },
    {
      name: "postalCode",
      label: t("onboarding.delivery.postalCode", "Postal code"),
      autoComplete: "postal-code",
    },
    {
      name: "country",
      label: t("onboarding.delivery.country", "Country"),
      autoComplete: "country",
    },
  ] as const;

  return (
    <WizardPage
      step="delivery"
      title={t("onboarding.delivery.title", "Where should we ship your SIM?")}
      subtitle={t(
        "onboarding.delivery.subtitle",
        "We'll mail your physical SIM to this address. You can still change your plan on the next step.",
      )}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {/* addressOutsideDeliveryArea is recoverable: fix the address and submit again. */}
          {seamError ? <SeamErrorNotice error={seamError} /> : null}

          {fields.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label}</FormLabel>
                  <FormControl>
                    <Input autoComplete={f.autoComplete} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <WizardNav
            onBack={() =>
              navigate({
                to: `/onboarding/${stepBefore("delivery", { offersEsim: TENANT_OFFERS_ESIM, simType: state.simType })}`,
              })
            }
            continueType="submit"
            continueLabel={t("onboarding.delivery.continue", "Save address")}
            busy={form.formState.isSubmitting}
          />
        </form>
      </Form>
    </WizardPage>
  );
}
