// CPR BFF proxy route (cpr-bff-auth Task 1). Same-origin server endpoint that injects the
// server-held CPR token + X-Tenant-ID and forwards an allowlisted set of CPR paths. The client
// (cpr-http driver) calls /bff/cpr/<cpr-path> with NO token.
//
// This is the first hand-authored server route; it follows the createFileRoute().server.handlers
// shape of the (auto-generated) mcp routes. All logic lives in services/bff so it is unit-testable
// without the Worker runtime; this file only wires the real deps (server env + global fetch).
import { createFileRoute } from "@tanstack/react-router";

import { readBffCprConfig, resolveDxpTenant } from "@/services/bff/bff-env";
import { handleBffCpr } from "@/services/bff/cpr-proxy";

export const Route = createFileRoute("/bff/cpr/$")({
  server: {
    handlers: {
      ANY: ({ request }) =>
        handleBffCpr(request, {
          config: readBffCprConfig(),
          resolveTenant: resolveDxpTenant,
          fetchUpstream: fetch,
        }),
    },
  },
});
