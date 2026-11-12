import { createFileRoute, redirect } from "@tanstack/react-router";

/*
 * /onboarding index → redirect to the first step. Visiting the bare path lands the user on the
 * welcome step rather than an empty layout. The redirect runs before load, so there is no flash.
 */
export const Route = createFileRoute("/onboarding/")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/welcome" });
  },
});
