# CPR onboarding + recharge — real response shapes (from Glean/CPI docs)

**Source:** "DXP REST Interface Description and Use Cases" (34/1551-CSH 109 911, rev Y, CPI Store),
read via Glean on 2026-11-13. These are the **real** sample request/response bodies for the calls
in `Multi-tenant-customer.postman_collection.json`. The Postman collection has NO saved responses;
these shapes are what let the http-driver mappers be written WITHOUT a reachable cluster.

Confidence: **high** for party / customer / contract / errors (doc has concrete samples);
**medium** for payment / monetaryRecharge (doc gives fields + TMF676 swagger; no full sample here).

All calls carry `X-Tenant-ID: <TEN…>` + `Authorization: Bearer <token>`. IDs are UUIDs unless noted.

---

## Auth — POST /auth/realms/dxp/protocol/openid-connect/token
Keycloak, `grant_type=password`, `client_id=dxp-frontend`. Response (standard OIDC):
```json
{ "access_token": "eyJ…", "expires_in": 300, "refresh_token": "…", "token_type": "Bearer" }
```
Collection reads `access_token`. (Refresh/expiry handling is ours to add.)

## POST /customerManagement/v1/party
Request: `{ type:"Individual", partyNames:[{givenName,familyName,…}], contactMedia:[…],
paymentMethod:[…], gdprPreferences, … }` (the collection's body).
**Response (create): just the id.**
```json
{ "id": "eef2e144-431a-49d7-8fad-d04d8fdf254d" }
```
→ mapper `fromTmfPartyCreate`: read `.id` → `partyId`. (Collection script: `partyId = responseData.id`.)

GET /customerManagement/v1/party/{id} returns the full party (type, partyNames[], contactMedia[],
partyRoles[], statuses:[{status:"PartyActive"|"PartyInactive",validFor}], gdprPreferences, …).
A party must be **PartyActive** before a customer can engage it (else error 4040 "Party is not active").

## POST /customerManagement/v1/customer
Request: `{ engagedPartyId, engagedPartyType:"Individual", statuses:[…], customerType, customerSubType, externalId, … }`.
**Response (create): the id** (collection reads `responseData.id`).
```json
{ "id": "37382a79-0e4b-4200-b646-de400a830259" }
```
> Note: the xCAC variant (`POST /xCACcore/v1/customer`) instead returns
> `{ "customerId": "...", "partyId": "...", "characteristics": [...] }`. We use the
> `/customerManagement/v1/customer` form (the collection's), so read `.id`.

GET /customerManagement/v1/customer/{id}:
```json
{ "id": "...", "engagedPartyId": "...", "statuses": [{ "status": "CustomerCreated"|"CustomerActive", "reason": "...", "validFor": { "start": "…Z" } }],
  "numberOfPrepaidContracts": 0, "customerType": "Residential", "customerSubType": "VIP",
  "characteristics": [{ "name": "...", "value": "..." }], "engagedPartyType": "Individual" }
```

> **CORS note (Task 8):** when the app (another origin) calls these over the browser, the server
> must answer the CORS preflight (`OPTIONS`) and send `Access-Control-Allow-Origin`. The local fake
> now does (`tools/cpr-fake`, `*` — dev only). The real cluster/BFF must allow the app origin too.

## GET /customerManagement/v1/customerview/{id}  — captured from the fake (Task 5.1)

The CPI doc's customerview sample is large and postpaid-flavored; the collection has none. So this
is the **prepaid shape captured from our fake** (`tools/cpr-fake`), confirmed 2026-11-13, which the
`fromTmfCustomerView` mapper is written against. When the real cluster is reachable, re-capture and
reconcile (the real one carries more fields; the mapper reads only what the domain needs).
```json
{
  "id": "cust-fake-0002",
  "statuses": [{ "status": "CustomerCreated", "reason": "created", "validFor": { "start": "…Z" } }],
  "customerType": "Residential",
  "engagedParty": {
    "id": "party-fake-0001",
    "type": "Individual",
    "partyNames": [{ "givenName": "Ada", "familyName": "Lovelace" }],
    "contactMedia": [
      { "contactMediumType": "EmailContact", "contactMediumValue": [{ "value": "ada@x.io", "purpose": "EmailContact" }] },
      { "contactMediumType": "PhoneContact", "contactMediumValue": [{ "value": "+4368…", "purpose": "Telephone" }] }
    ],
    "statuses": [{ "status": "PartyActive", "reason": "created", "validFor": { "start": "…Z" } }]
  },
  "contracts": [{ "id": "contract-fake-0003", "customerId": "cust-fake-0002", "communicationId": "+4368…", "paymentContext": "PREPAID", "statuses": [{ "status": "ContractActive", … }] }]
}
```
→ `fromTmfCustomerView` maps to domain `{ customer, party }`:
- `customer.customerId` = `id`; `customer.status` collapses `statuses[].status` (`CustomerActive`→`active`,
  else `pending`); `customer.partyId` = `engagedParty.id`; `customer.tenantId` = the brand the call
  was made for (customerview has no tenant — it's pinned by the X-Tenant-ID header).
- `party.partyId` = `engagedParty.id`; `givenName`/`familyName` from `partyNames[0]`; `email` from
  the `EmailContact` contactMedium; `msisdn?` from the `PhoneContact` (Telephone) if present.
- `contracts[]` is NOT mapped here (the domain `{customer, party}` has no contract field yet;
  it's the write-only mock state's read counterpart — surfacing the contract in the 360 is a
  later concern).

## POST /customerManagement/v1/contract
Request: `{ customerId, communicationId, paymentContext:"PREPAID", agreementDocumentNumber, statuses:[{status:"ContractActive",validFor:{start}}], externalId, … }`.
**Response (create): the id** (collection reads `responseData.id`).
GET/PATCH /customerManagement/v1/contract/{id}:
```json
{ "id": "c37f9500-ba04-4df3-8f43-8e246148d268", "agreementDocumentNumber": "230042432312594005",
  "statuses": [{ "status": "ContractActive", "reason": "...", "validFor": { "start": "…Z" } }],
  "paymentContext": "PREPAID", "communicationId": "814123434958",
  "contractSpecification": { "id": "", "href": "string" }, "characteristics": [{ "name", "value" }],
  "customerId": "34d608c6-…", "externalId": "23003345350878" }
```
→ the contract ties `customerId` ↔ `communicationId` (MSISDN); recharge references all three.

## POST /payment/v4/payment  (TMF676)  — confidence medium
Request: the collection's body (`account.id = communicationId`/MSISDN, `payer.id = customerId`,
`amount {unit:"EUR",value}`, `paymentMethod.@type:"cash"`, `relatedEntity Journey:monetaryRecharge`,
`status:"SUCCESS"`). TMF676 swagger: 201 Created returns a `Payment` = `Payment_Create` PLUS
`id, href, status, statusDate, paymentDate`. Collection reads `id`, `authorizationCode`,
`transactionDateTime`. So expect at least:
```json
{ "id": "...", "authorizationCode": "Payer-AuthCode_…", "status": "SUCCESS", "paymentDate": "…Z", "transactionDateTime": "…" , "amount": { "unit":"EUR", "value": 11.01 } }
```
DXP note (BUC dxpBeUpfrontPaymentSupport): `/payment/v4/payment` is a **direct capture** of the
transaction after validation — it rejects a reused `authorizationCode` (error 33028). So for
headless recharge, **the client captures payment FIRST**, then submits the journey (matches our
authorize/capture → "create payment", then credit → monetaryRecharge).

## POST /xCACcore/v1/customerInteraction  (journey monetaryRecharge) — confidence medium
Request: the collection's body (`customerId, contractId, journeyId:"monetaryRecharge",
type:"PurchaseOrder", journeyData.msisdn, journeyData.monetaryRechargeDetails {amount,unit},
journeyData.payment {merchantRefNum=paymentId, paymentGwTransactionId=authorizationCode, …}`).
**Response: 200 + the party interaction id** (collection reads `responseData.partyInteractionId`):
```json
{ "partyInteractionId": "PIN100000200051" }
```
(The xCAC journey-submit variant returns `{ partyInteractionId, relatedEntity:[{id,role:"order",…}] }`;
the monetaryRecharge form returns at least `partyInteractionId`.)

> **Fake (recharge spec Task 1):** `tools/cpr-fake` now serves both. `POST /payment/v4/payment` →
> `201 { id:"pay-fake-N", authorizationCode, status:"SUCCESS", transactionDateTime, amount }`; a
> REUSED `authorizationCode` → `409 { code:33028 }` (the direct-capture reuse rule, testable).
> `POST /xCACcore/v1/customerInteraction` → `200 { partyInteractionId:"PIN-fake-N" }`, requiring
> `journeyId`+`customerId`+`contractId` (missing → the `{code,reason,message}` envelope). These are
> best-effort against the medium-confidence shapes above; reconcile at cluster cut-over.

---

## Error envelope (all CPR calls)
```json
{ "code": 4041, "reason": "Bad Request", "message": "Duplicate partyId" }
```
Observed codes: 4040 "Party is not active", 4041 "Duplicate partyId" / "party cannot be inactivated…",
5031/5032 customer inactivation blocked, 5034 wrong party status transition, 33028 payment auth-code reuse.
→ map `code`/`message` → `SeamError` with a category (validation/conflict/rejected/unknown).

## Mapper implications (for the *-http.ts, Fase 8)
- `fromTmfPartyCreate`: `.id` → partyId. `fromTmfCustomerCreate`: `.id` → customerId (v1 form).
- New `createContract` seam op: POST contract, read `.id` → contractId; carry `communicationId` (MSISDN).
- Party must be active before customer; sequence party → customer → contract holds.
- Recharge: `runTopUp` → POST /payment/v4/payment (read id + authorizationCode) → POST
  /xCACcore/v1/customerInteraction monetaryRecharge (read partyInteractionId). Capture before journey.
- Errors: parse the `{code,reason,message}` envelope in the `request()` helper → SeamError.
