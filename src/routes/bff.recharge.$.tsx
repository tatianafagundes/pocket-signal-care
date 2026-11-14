// Recharge BFF proxy route (cpr-recharge Task 5). Same-origin server endpoint that injects the
// server-held RECHARGE_TOKEN + X-Tenant-ID and forwards an allowlisted set of charging paths
// (payment capture, monetaryRecharge journey, TMF654 bucket read). The client (charging-http
// driver) calls /bff/recharge/<charging-path> with NO token.
//
// Twin of bff.cpr.$.tsx: all logic lives in services/bff/recharge-proxy so it is unit-testable
// without the Worker runtime; this file only wires the real deps (server env + global fetch).
import { createFileRoute } from "@tanstack/react-router";

import { readBffRechargeConfig, resolveDxpTenant } from "@/services/bff/bff-env";
import { handleBffRecharge } from "@/services/bff/recharge-proxy";

export const Route = createFileRoute("/bff/recharge/$")({
  server: {
    handlers: {
      ANY: ({ request }) =>
        handleBffRecharge(request, {
          config: readBffRechargeConfig(),
          resolveTenant: resolveDxpTenant,
          fetchUpstream: fetch,
        }),
    },
  },
});
