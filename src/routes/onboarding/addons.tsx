import { createFileRoute, redirect } from "@tanstack/react-router";

// Extras are now offered on the Review step; keep old links working.
export const Route = createFileRoute("/onboarding/addons")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/review", replace: true });
  },
});
