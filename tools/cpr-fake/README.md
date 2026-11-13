# cpr-fake — local fake DXP CPR server

A tiny Node HTTP server that mirrors the DXP CPR onboarding calls in the customer's Postman
collection, so the `cpr` http driver can be built and tested **without a reachable cluster**.

- Node standard library only. No dependency. Not imported by the app. Not in the build or bundle.
- Shapes follow `docs/contracts/postman/response-shapes.md` and the collection
  `Multi-tenant-customer.postman_collection.json`.

## Run

```bash
npm run cpr:fake              # or: bun run cpr:fake
CPR_FAKE_PORT=9000 npm run cpr:fake   # custom port (default 8787)
```

Listens on `http://127.0.0.1:8787` (localhost only).

## PII / security

`GET /__debug/last` returns the last received request bodies, which carry PII (name, email, MSISDN).
The ring is **in memory only** — never written to disk, never logged. The `Authorization` header is
redacted to a presence flag in the ring; bodies are kept as-is for request-fidelity assertions.

**This is a local dev aid. Never deploy it.**

## Routes

All business routes require `X-Tenant-ID` and `Authorization: Bearer <token>` (any non-empty values;
the fake does not validate the token). Missing/malformed headers → `401` + the error envelope.

| Method | Path | Returns |
|---|---|---|
| POST | `/auth/realms/dxp/protocol/openid-connect/token` | `{ access_token, expires_in, refresh_token, token_type }` (no headers required) |
| POST | `/customerManagement/v1/party` | `201 { id }` |
| GET  | `/customerManagement/v1/party/{id}` | full party (`statuses:[PartyActive]`, names, contactMedia) |
| POST | `/customerManagement/v1/customer` | `201 { id }` — requires an existing, active `engagedPartyId` |
| GET  | `/customerManagement/v1/customer/{id}` | full customer |
| POST | `/customerManagement/v1/contract` | `201 { id }` — requires an existing `customerId` + `communicationId` |
| GET  | `/customerManagement/v1/contract/{id}` | full contract |
| GET  | `/customerManagement/v1/customerview/{id}` | composite: customer + engagedParty + contracts (shape confirmed in Task 5.1) |
| GET  | `/__debug/last?n=1` | last N requests (PII in memory) |
| POST | `/__debug/reset` | clear all state |

### Error envelope

```json
{ "code": 4041, "reason": "Bad Request", "message": "Duplicate partyId" }
```

Fake error cases:
- missing `X-Tenant-ID` → `401 { code:4010 }`
- missing/malformed `Authorization` → `401 { code:4011 }`
- customer create with unknown/inactive party → `404 {4044}` / `400 {4040 "Party is not active"}`
- contract create with unknown customer → `404 {4044}`; missing communicationId → `400 {4001}`

## Quick smoke (curl)

```bash
BASE=http://127.0.0.1:8787
H=(-H 'X-Tenant-ID: TEN_FAKE' -H 'Authorization: Bearer fake' -H 'Content-Type: application/json')

# token
curl -s -XPOST "$BASE/auth/realms/dxp/protocol/openid-connect/token"

# party -> customer -> contract
PID=$(curl -s "${H[@]}" -XPOST "$BASE/customerManagement/v1/party" \
  -d '{"type":"Individual","partyNames":[{"givenName":"Ada","familyName":"Lovelace"}]}' | sed 's/.*"id":"\([^"]*\)".*/\1/')
CID=$(curl -s "${H[@]}" -XPOST "$BASE/customerManagement/v1/customer" \
  -d "{\"engagedPartyId\":\"$PID\",\"engagedPartyType\":\"Individual\"}" | sed 's/.*"id":"\([^"]*\)".*/\1/')
curl -s "${H[@]}" -XPOST "$BASE/customerManagement/v1/contract" \
  -d "{\"customerId\":\"$CID\",\"communicationId\":\"+4368100000001\",\"paymentContext\":\"PREPAID\"}"

# inspect what the fake received
curl -s "$BASE/__debug/last?n=3"
```
