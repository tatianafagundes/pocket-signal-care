#!/usr/bin/env node
// Fake DXP CPR server for local development of the `cpr` http driver.
//
// NODE STANDARD LIBRARY ONLY — no dependency, not imported by the app, not shipped.
// It mirrors the requests/responses in:
//   - docs/contracts/postman/Multi-tenant-customer.postman_collection.json
//   - docs/contracts/postman/response-shapes.md
//
// SECURITY / PII: GET /__debug/last returns the last N request bodies, which carry PII
// (name, email, MSISDN). The ring is IN MEMORY ONLY — never written to disk, never logged.
// This server is a local dev aid. NEVER deploy it.
//
// Run:  npm run cpr:fake    (or: node tools/cpr-fake/server.mjs)
// Port: CPR_FAKE_PORT (default 8787)

import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.CPR_FAKE_PORT ?? 8787);
const RING_MAX = 50;

// --- in-memory state (reset on restart) -------------------------------------
/** @type {Array<{ at:string, method:string, path:string, headers:Record<string,string|undefined>, body:unknown }>} */
const requestRing = [];
const parties = new Map(); // id -> party
const customers = new Map(); // id -> customer
const contracts = new Map(); // id -> contract
let seq = 0;
const nextId = (prefix) => `${prefix}-fake-${String(++seq).padStart(4, "0")}`;

// --- helpers ----------------------------------------------------------------
function send(res, status, bodyObj) {
  const body = bodyObj === undefined ? "" : JSON.stringify(bodyObj);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Error envelope exactly as response-shapes.md: { code, reason, message }. */
function sendError(res, status, code, reason, message) {
  send(res, status, { code, reason, message });
}

function nowIso() {
  return new Date().toISOString();
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // guard
    });
    req.on("end", () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ __unparsed: raw });
      }
    });
  });
}

/** All business routes require X-Tenant-ID + Authorization: Bearer. Returns true if OK. */
function authOk(req, res) {
  const tenant = req.headers["x-tenant-id"];
  const auth = req.headers["authorization"];
  if (!tenant) {
    sendError(res, 401, 4010, "Unauthorized", "Missing X-Tenant-ID header");
    return false;
  }
  if (!auth || !String(auth).toLowerCase().startsWith("bearer ")) {
    sendError(res, 401, 4011, "Unauthorized", "Missing or malformed Authorization header");
    return false;
  }
  return true;
}

// --- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";
  const body = method === "GET" ? undefined : await readBody(req);

  // Record every request (PII in memory only).
  requestRing.push({
    at: nowIso(),
    method,
    path,
    headers: {
      "x-tenant-id": req.headers["x-tenant-id"],
      authorization: req.headers["authorization"] ? "Bearer <redacted-presence-only>" : undefined,
      "content-type": req.headers["content-type"],
    },
    body,
  });
  if (requestRing.length > RING_MAX) requestRing.shift();

  // --- debug (local only) ---
  if (method === "GET" && path === "/__debug/last") {
    const n = Number(url.searchParams.get("n") ?? 1);
    return send(res, 200, requestRing.slice(-Math.max(1, n)));
  }
  if (method === "POST" && path === "/__debug/reset") {
    requestRing.length = 0;
    parties.clear();
    customers.clear();
    contracts.clear();
    seq = 0;
    return send(res, 200, { ok: true });
  }

  // --- auth (Keycloak) — no header requirement ---
  if (method === "POST" && path === "/auth/realms/dxp/protocol/openid-connect/token") {
    return send(res, 200, {
      access_token: "fake-access-token",
      expires_in: 300,
      refresh_token: "fake-refresh-token",
      token_type: "Bearer",
    });
  }

  // Everything below is a business route → require headers.
  if (!authOk(req, res)) return;

  // --- POST party ---
  if (method === "POST" && path === "/customerManagement/v1/party") {
    const id = nextId("party");
    parties.set(id, {
      id,
      type: body?.type ?? "Individual",
      partyNames: body?.partyNames ?? [],
      contactMedia: body?.contactMedia ?? [],
      statuses: [{ status: "PartyActive", reason: "created", validFor: { start: nowIso() } }],
    });
    return send(res, 201, { id }); // create returns just the id
  }

  // --- GET party/{id} ---
  {
    const m = path.match(/^\/customerManagement\/v1\/party\/([^/]+)$/);
    if (method === "GET" && m) {
      const party = parties.get(m[1]);
      if (!party) return sendError(res, 404, 4044, "Not Found", "Party not found");
      return send(res, 200, party);
    }
  }

  // --- POST customer ---
  if (method === "POST" && path === "/customerManagement/v1/customer") {
    const engagedPartyId = body?.engagedPartyId;
    if (!engagedPartyId) {
      return sendError(res, 400, 4000, "Bad Request", "Missing engagedPartyId");
    }
    const party = parties.get(engagedPartyId);
    if (!party) {
      return sendError(res, 404, 4044, "Not Found", "Party not found");
    }
    const active = party.statuses?.some((s) => s.status === "PartyActive");
    if (!active) {
      return sendError(res, 400, 4040, "Bad Request", "Party is not active");
    }
    const id = nextId("cust");
    customers.set(id, {
      id,
      engagedPartyId,
      engagedPartyType: body?.engagedPartyType ?? "Individual",
      statuses: [{ status: "CustomerCreated", reason: "created", validFor: { start: nowIso() } }],
      numberOfPrepaidContracts: 0,
      customerType: body?.customerType ?? "Residential",
      customerSubType: body?.customerSubType ?? "",
      characteristics: body?.characteristics ?? [],
    });
    return send(res, 201, { id });
  }

  // --- GET customer/{id} ---
  {
    const m = path.match(/^\/customerManagement\/v1\/customer\/([^/]+)$/);
    if (method === "GET" && m) {
      const customer = customers.get(m[1]);
      if (!customer) return sendError(res, 404, 4044, "Not Found", "Customer not found");
      return send(res, 200, customer);
    }
  }

  // --- GET customerview/{id} ---
  // Prepaid-flavored composite view: the customer, its engaged party, and its contracts.
  // Shape is a best-effort guess for the fake; Task 5.1 captures/confirms it before the
  // real fromTmfCustomerView mapper is written.
  {
    const m = path.match(/^\/customerManagement\/v1\/customerview\/([^/]+)$/);
    if (method === "GET" && m) {
      const customer = customers.get(m[1]);
      if (!customer) return sendError(res, 404, 4044, "Not Found", "Customer not found");
      const party = parties.get(customer.engagedPartyId) ?? null;
      const customerContracts = [...contracts.values()].filter((c) => c.customerId === customer.id);
      return send(res, 200, {
        id: customer.id,
        statuses: customer.statuses,
        customerType: customer.customerType,
        engagedParty: party,
        contracts: customerContracts,
      });
    }
  }

  // --- POST contract ---
  if (method === "POST" && path === "/customerManagement/v1/contract") {
    const customerId = body?.customerId;
    const communicationId = body?.communicationId;
    if (!customerId) {
      return sendError(res, 400, 4000, "Bad Request", "Missing customerId");
    }
    if (!customers.has(customerId)) {
      return sendError(res, 404, 4044, "Not Found", "Customer not found");
    }
    if (!communicationId) {
      return sendError(res, 400, 4001, "Bad Request", "Missing communicationId");
    }
    const id = nextId("contract");
    contracts.set(id, {
      id,
      customerId,
      communicationId,
      paymentContext: body?.paymentContext ?? "PREPAID",
      statuses: body?.statuses ?? [
        { status: "ContractActive", reason: "created", validFor: { start: nowIso() } },
      ],
      agreementDocumentNumber: body?.agreementDocumentNumber ?? "",
      externalId: body?.externalId ?? "",
      contractSpecification: body?.contractSpecification ?? { id: "", href: "" },
      characteristics: body?.characteristics ?? [],
    });
    return send(res, 201, { id });
  }

  // --- GET contract/{id} ---
  {
    const m = path.match(/^\/customerManagement\/v1\/contract\/([^/]+)$/);
    if (method === "GET" && m) {
      const contract = contracts.get(m[1]);
      if (!contract) return sendError(res, 404, 4044, "Not Found", "Contract not found");
      return send(res, 200, contract);
    }
  }

  // --- fall-through ---
  return sendError(res, 404, 4040_0, "Not Found", `No fake route for ${method} ${path}`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[cpr-fake] listening on http://127.0.0.1:${PORT}  (local dev only — do not deploy)`);
});
