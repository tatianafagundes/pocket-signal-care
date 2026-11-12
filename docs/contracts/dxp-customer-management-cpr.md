# DXP Customer Management (CPR) — Knowledge Base

> O seam **mais importante** do app: o CPR é o único seam "real-able" (os outros são mock até a
> Fase 8). Base de conhecimento a partir da documentação **interna** do DXP indexada no Glean
> (CPI Store / DevPortal / Confluence). Fonte de verdade para `createParty`, `createCustomer`,
> `getCustomer360`.

## Fontes (Glean — docs internos Ericsson)

- **Customer Management API** (REST spec): doc nº **155 19-FAY 302 343/2-V1**, rev. Z/AA, "2.8.11" — [CPI Store](https://cpistore.internal.ericsson.com/elex?LI=EN/LZN7030262R14A/2&FN=15519-FAY302343_2-V1Uen.Z._.pdf)
- **DXP REST Interface Description and Use Cases**: doc nº **34/1551-CSH 109 911**, rev. Y — [CPI Store](https://cpistore.internal.ericsson.com/elex?LI=EN/LZN7030262R14A/2&FN=34_1551-CSH109911Uen.Y.html)
- **Component: Customer Management Connector (`ericsson-dxp-customermgmtconn-db`)** — [DevPortal](https://devportal.internal.ericsson.com/catalog/default/component/ericsson-dxp-customermgmtconn-db)
- **OP: DMP Evolved: SLCM Basic Use Cases** (fluxo de onboarding prepago) — Confluence SA BSS
- **DXP Technical Product Description** — DevPortal

> Nota: os docs internos não puderam ser baixados como PDF (links autenticados). O conteúdo
> abaixo vem dos **snippets indexados pelo Glean** — suficientes para endpoints, nomes de campo e
> o fluxo, mas **não** para schemas JSON completos. Onde for inferência, está marcado.

---

## 1. O que é o CPR

**Customer Profile Repository (CPR)** — a camada do DXP que **federa** party/customer, installed
base e saldo de vários sistemas e persiste localmente numa **Cassandra**. Exposto pela
**Customer Management REST API** (`ericsson-dxp-customermgmtconn-db`).

Ponto arquitetural confirmado (OP CBEV Convenience API + Technical Product Description):
> "DXP CPR **não** faz live-call ao CBEV para customer e party a cada consulta — ele **federa e
> persiste** party/customer localmente em CPR (Cassandra), busca o **installed base no Service
> Registry (SR)**, e busca **só o balance no CBEV** no momento da consulta."

**Isso valida diretamente o nosso `getCustomer360` com fan-out:** party/customer (CPR) +
installed base (SR→nosso order seam) + balance (CBEV→nosso charging seam), composto numa view.
CPR = TMF632 (Party) + TMF629 (Customer) + Contract (Ericsson, não-TMF) + Interactions.

---

## 2. Endpoints reais (Customer Management v1/v2)

Base: `/customerManagement/v1/...` (e algumas `v2`). Entry API: `/entryApi/v1/cpr/...`.

### Party (TMF632)
| Método | Path | O que faz |
|---|---|---|
| GET | `/customerManagement/v1/party` | lista/busca party (filtro string, ver §4) |
| POST | `/customerManagement/v1/party` | **cria party** (o nosso `createParty`) |
| POST | `/customerManagement/v2/party` | cria party (v2) |
| GET | `/customerManagement/v1/party/{partyId}` | detalhes do party |
| DELETE | `/customerManagement/v1/party/{partyId}` | remove party (usado em rollback) |
| PATCH | `/customerManagement/v1/party/{partyId}` | atualiza party (ex.: characteristics) |
| GET | `/customerManagement/v1/partyByCustomerId` | party a partir do customerId |

### Customer (TMF629)
| Método | Path | O que faz |
|---|---|---|
| GET | `/customerManagement/v1/customer` | lista/busca customer |
| POST | `/customerManagement/v1/customer` | **cria customer** (o nosso `createCustomer`) — "Add a new customer in DXP" |
| GET | `/customerManagement/v1/customer/{customerId}` | detalhes |
| DELETE | `/customerManagement/v1/customer/{customerId}` | remove (rollback) |
| PATCH | `/customerManagement/v1/customer/{customerId}` | atualiza (ver `CustomerUpdate` schema) |
| GET | `/customerManagement/v1/customer/{customerId}/contract/count` | nº de contracts ativos |
| POST | `/customerManagement/v1/customer/query` | busca por query |
| **GET** | **`/customerManagement/v1/customerview/{customerId}`** | **a Customer 360 view** (o nosso `getCustomer360`!) |
| GET | `/customerManagement/v1/customerBypartyId` | customer a partir do partyId |

### Contract (Ericsson — NÃO é TMF; novo no nosso modelo)
| Método | Path | O que faz |
|---|---|---|
| GET | `/customerManagement/v1/contract` · `v2/contract` | lista/busca contract |
| POST | `/customerManagement/v1/contract` | **cria contract** (o EOC chama após o fulfillment) |
| GET/DELETE/PATCH | `/customerManagement/v1/contract/{contractId}` | detalhes/remove/atualiza |
| POST | `.../contract/clearRefillBarringCounter` · `incrementRefillBarringCounter` | refill barring (prepaid) |
| GET | `.../contract/refillBarringStatus` | status de refill barring (prepaid) |

### Billing Account
| POST | `/customerManagement/v1/billingAccount` | cria billing account (ver §6 — contradição prepaid) |

### Entry API (rotas de fachada, o que a UI/canal realmente chama)
`/entryApi/v1/cpr/party` · `/entryApi/v1/cpr/customer` · `/entryApi/v1/cpr/contract` ·
`/entryApi/v1/cpr/customerByPartyId` · `/entryApi/v1/cpr/partyByCustomerId` ·
`/entryApi/v1/cpr/validateCustomerId` (→ `ericsson-dxp-id-validation`).

---

## 3. Fluxo de onboarding PREPAID real (OP SLCM Basic Use Cases, UC-520)

Sequência textual real (Confluence, "Create Customer, Onboarding, Prepaid"):

```
Order Capture:   CSRTB → JXC → XCAC → CPR → AEL → CPM
   Create Party
   Create Customer
   Create Billing Account            ← ver §6 (contradiz "prepaid sem billing")
Order Fulfillment (CBEV):
   Create contract (bssfSubscription)
   Create product (TMF637)
   Rate and Reserve
   Rate and Deduct
   Create contract and products in CPR
   Update customer interaction
   (+ SLCM: Create subscription in SLCM module — quando SLCM gerencia o plano)

360 View (prepaid):  CSRTB → CPR → AEL → CPM/CHA  →  Get contract
```

**O que isso nos ensina (confirma e corrige a nossa spec):**
- A ordem **Party → Customer → (Billing?) → Contract → Product → saldo** é real. A nossa
  orquestração (`createParty → createCustomer → … → getCustomer360`) está **alinhada** na espinha.
- **"Contract" é uma entidade de primeira classe** que nós não modelamos. No real, é o `contract`
  no CPR que amarra customer↔produtos↔plano. O nosso "installed base" é o conjunto de `product`
  (TMF637) sob o contract. **Dívida:** considerar um conceito de contract no Customer 360 real.
- **"Create product (TMF637)"** confirma o que o KB do TMF637 disse: produtos (plano, SIM, número)
  são criados no inventory durante o fulfillment.
- **Prepaid pré-SLCM** já era suportado ("DXP currently support prepaid integration with Ericsson
  Charging with onboarding of new prepaid subscribers").

---

## 4. Payload de party / customer (dos snippets)

### Criar party — regras reais
- "Adds a Party. **Rejeita duplicar** party: se o Party ID existe com status **Inactive** →
  erro *Party Not Active*; se existe **Active** → erro *Duplicate Party* (quando multi-account
  desabilitado)." Com `multiAccountFeatureEnable` + `multiCustomerRoleForParty` ambos `true`,
  duplicar party ativo é permitido.
- Campos vistos nos exemplos: `characteristics` (name/value — ex.: `identityVerificationId`,
  `externalCustomerId`), `statuses` (`PartyActive`/`PartyInactive` com `validFor`),
  `gdprPreferences` (`versionNumber`, `concent`), `externalId`, relatedParty `role: CUSTOMER`.

### Criar customer
- "Add a new customer in DXP." Exemplo de resposta: `{ "id": "059abab5-..." }` (devolve só o id).
- Há `customerSubType` opcional e `CustomerUpdate` schema para PATCH.
- **id → externalId**: o DXP mapeia o "human readable id" como chave pública para sistemas
  externos (BEL/billing). (BUC postpaid)

### Filtro (lista) — sintaxe real
String com operadores: `firstName=Test` (igual) · `firstName=Test,Test1` (IN/OR de valores) ·
`a=1;b=2` (OR entre campos) · `a=1&b=2` (AND). Vale para party e contract
(`relatedPartyRole=Contract&relatedPartyId=123`).

---

## 5. Customer 360 real (valida o nosso fan-out)

- **Endpoint:** `GET /customerManagement/v1/customerview/{customerId}`.
- **Use cases** (OP CBEV Convenience): UC-081 "Search Customer & View 360", UC-117 "Show Balance",
  UC-119 "Get Free Units", UC-120 "Show Orders/Interactions", UC-123 "Request Installed Base".
- **Composição real:** identidade+party de CPR (local) + installed base do **SR** + balance do
  **CBEV** (buscado no momento). Exatamente o shape do nosso `composeCustomer360`
  (party/customer + installedBase + balance), com degradação graciosa.
- **Nuance:** "installed base" tem **dois donos** no DMP Evolved (SR e CBEV consolidated) — para
  nós é o order seam; registrar que no real pode vir de SR.

---

## 6. ⚠️ Contradição a resolver: Billing Account no prepaid

**Há duas fontes que se contradizem — registrado, não resolvido no chute:**

- **Esta fonte (OP SLCM Basic Use Cases, fluxo prepaid):** o passo **"Create Billing Account"
  aparece no fluxo de onboarding _prepaid_** (mesma sequência que o postpaid).
- **O KB do TMF622 (`tmf622-product-ordering.md`):** o **exemplo de ProductOrder prepaid real
  não traz `billingAccount`** (usa `relatedEntity role=CustomerAccount`); billing não é `required`.
- **A nossa spec e a HLD do Value Accelerator:** "prepaid **não** cria Billing Account".

**Leitura mais provável (inferência, confiança média):** o "Create Billing Account" do fluxo SLCM
é do **DMP Evolved full-stack** (CBEV + billing), enquanto o nosso cenário é **DXP + Ericsson
Charging (prepaid puro / Slim CPR)**, onde o saldo é wallet de charging, não billing account. Ou
seja: **os dois podem estar certos em contextos diferentes** (full DMP vs. prepaid-charging).

**Ação:** manter a decisão da spec (**prepaid sem Billing Account** no nosso cenário DXP+Charging)
**mas registrar o ponto como a confirmar na Fase 8** com o time de DXP — se o deployment-alvo for
full DMP Evolved, o billing account entra. Não mudar a spec agora; sinalizar.

---

## Tabela: nosso CPR seam ↔ Customer Management real

| Nosso seam (`api.ts`) | Endpoint real | Observação |
|---|---|---|
| `createParty({tenantId, givenName, familyName, email})` | `POST /customerManagement/v1/party` (ou `v2`) | tenant via header `X-Tenant-Id`; regras de duplicado reais |
| `createCustomer({tenantId, partyId})` | `POST /customerManagement/v1/customer` | devolve `{ id }` |
| `getCustomer360(customerId)` | `GET /customerManagement/v1/customerview/{customerId}` | 360 view; fan-out CPR+SR+CBEV |
| `resolveTenant(tenantId)` | (multitenancy — header `X-Tenant-Id`) | tenant resolvido pelo token/header |
| *(não temos)* contract | `POST /customerManagement/v1/contract` | **entidade real que falta no nosso modelo** |

---

## Dívidas / pontos de atenção para a Fase 8 (`cpr-http.ts`)

1. **Endpoints confirmados** acima (party/customer/customerview). Usar o **Entry API**
   (`/entryApi/v1/cpr/...`) como fachada, com `x-alt-route` quando precisar de v2.
2. **Tenant = header `X-Tenant-Id`**; auth = **Bearer JWT** (o JWT carrega o tenant em multitenancy).
3. **Contract é uma entidade real** que não modelamos — no real, o plano provisionado vive sob um
   `contract` no CPR. Avaliar adicionar ao Customer 360.
4. **Regras de party duplicado** (Active→Duplicate, Inactive→Not Active, multiAccount flag) — o
   `createParty` real pode rejeitar; mapear para `SeamError` (`conflict`).
5. **`id` vs `externalId`**: o DXP usa human-readable id como chave pública para billing/externos.
6. **⚠️ Billing Account no prepaid**: contradição registrada (§6) — confirmar o contexto de
   deployment (DXP+Charging prepaid puro vs. DMP Evolved full-stack) antes de decidir.
7. **Customer 360 pode ter contract/SLCM details** no prepaid com SLCM — o nosso shape atual
   (plano+saldo) é um subconjunto.
8. **Bulk load** não é via esta API (performance) — usa Data Importer. Irrelevante para onboarding
   1-a-1, mas registrado.

### Confirma o que já estava certo
- Fan-out do Customer 360 (party/customer + installed base + balance) ✔
- `createParty` → `createCustomer` como ordem ✔
- `tenantId` no nosso modelo canônico (vira header no HTTP real) ✔
- Degradação graciosa (balance pode faltar) ✔
