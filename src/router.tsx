import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { SeamFailure } from "@/services/api";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    // Caching defaults live here (not on the router). Tuned for a self-care app where the data
    // (balance, plan, usage) changes on explicit actions — which invalidate their keys — not on
    // every navigation or tab focus.
    defaultOptions: {
      queries: {
        // 30s: stops a Home→My plan→Account hop (all three read ["customer360", …]) from
        // re-firing the getCustomer360 fan-out on each mount. Mutations still invalidate, so
        // post-action freshness is preserved.
        staleTime: 30_000,
        // A tab refocus shouldn't redo 7 reads in a self-care app.
        refetchOnWindowFocus: false,
        // Only retry what the seam says is transient. A SeamFailure carries `retryable`
        // (true only for `unavailable`); a validation/conflict error is NOT retried. Cap at 2.
        retry: (failureCount, error) =>
          error instanceof SeamFailure ? error.retryable && failureCount < 2 : failureCount < 2,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; the caching defaults above are on the QueryClient.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
