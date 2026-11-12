# DXP API Reference — Knowledge Base

Destilação dos contratos OpenAPI reais do **Ericsson DXP** (os YAMLs em
`contracts/dxp-reference/`) focada no que a nossa UI/seams usam. Fonte de verdade para a
integração real (Fase 8) e para validar os mocks agora.

> Cada `.md` cita arquivo + `info.version`, usa trechos reais, e marca "não confirmei" onde a
> leitura não alcançou. Nada foi inventado.

## Contratos

| Knowledge base | Contrato (TMF) | Nosso seam | `info.version` |
|---|---|---|---|
| [`tmf620-product-catalog.md`](./tmf620-product-catalog.md) | Product Catalog Management | `catalog` (`listOffers`) | 4.4 |
| [`tmf679-po-qualification.md`](./tmf679-po-qualification.md) | Product Offering Qualification (Commercial Browsing) | `catalog` (`qualifyOffer`) | 4.6 |
| [`shoppingcart.md`](./shoppingcart.md) | TMF663 Shopping Cart | `order` (`createCart`/`addItem`) | 1.0 |
| [`tmf622-product-ordering.md`](./tmf622-product-ordering.md) | Product Ordering Management | `order` (`submitOrder`) | 5.0.0 |
| [`tmf637-product-inventory.md`](./tmf637-product-inventory.md) | Product Inventory Management | `order` (`getInstalledBase`) | 4.1 |

Mais o seam mais importante (o único "real-able"), documentado a partir da doc **interna** do DXP (Glean):

| Knowledge base | Fonte | Nosso seam |
|---|---|---|
| [`dxp-customer-management-cpr.md`](./dxp-customer-management-cpr.md) | DXP Customer Management REST (155 19-FAY 302 343) + Use Cases (34/1551-CSH 109 911) + DevPortal | `cpr` (`createParty`/`createCustomer`/`getCustomer360`) |
| [`dxp-xcac-orchestration.md`](./dxp-xcac-orchestration.md) | XCAC Deep-Dive + Journey Patterns + xCACcore API (155 19-FAY 302 346) | orquestração (`submitOrder` / Journey Mesh na Fase 8) |
| [`cbev-charging.md`](./cbev-charging.md) | CBEV: BSS TMF654 Prepay Balance (302636/637) + BSSF Consolidated Customer (302706) + Integration/API Examples Guides | `charging` (`getBalance`/`topUp`/`rateAndDeduct`) |

**Investigação de contratos COMPLETA.** Os nove KBs cobrem todos os seams do onboarding
(catálogo, qualificação, cart, ordering, inventory, CPR, orquestração, billing BIH, charging CBEV).

(Charging/CBEV e DSIMA/Resource já estavam documentados das fases anteriores; estes seis cobrem
catálogo + pedido + CPR, o coração do onboarding da Fase 5.)

## Padrões transversais (valem para todos)

- **Tenant é sempre header `X-Tenant-Id`** — nunca campo de payload nem query. Só em multitenancy.
- **Auth = `Authorization: Bearer <JWT>`** na maioria (DXP); o **CBEV usa OAuth2** (IAM externo, ingress `bss-trf`).
- **Paginação = header `Range: items=a-b`** (ex.: TMF637).
- **Assíncrono é a norma de escrita.** ProductOrder volta `acknowledged` e completa depois; o
  POQ pode ser síncrono (`instantSyncQualification:true`→200) ou task (201→polling). Mocks
  síncronos são OK para a demo, mas o real exige polling/estado intermediário.
- **"Dinheiro" no TMF é decimal `{unit, value}`** (ex.: `{EUR, 14.90}`); o nosso modelo usa
  **minor units** (cents). Todo mapper real converte nos dois sentidos.

## Endpoints reais confirmados (CPR — nosso único seam real-able)

- `createParty` → `POST /customerManagement/v1/party`
- `createCustomer` → `POST /customerManagement/v1/customer`
- `getCustomer360` → `GET /customerManagement/v1/customerview/{customerId}`
- Entry API de fachada: `/entryApi/v1/cpr/party`, `/entryApi/v1/cpr/customer`, etc.
- Novo: entidade `contract` (`POST /customerManagement/v1/contract`) que não modelamos.

## Billing Account no prepaid — resolvido

As BSS Billing APIs (`bss-billing-bih.md`) confirmaram: o `Customer` (BSS TMF629) não exige
billing account, que é entidade separada (TMF666). Billing account é do mundo billing full-stack
(postpaid/DMP Evolved); no nosso prepaid puro (DXP+Charging) não é criado. Decisão "sem billing"
**confirmada** — só reabrir se o deployment-alvo for DMP Evolved full-stack.

## Southbound billing (fora de escopo da demo)

`contracts/dxp-reference/bss-billing-bih/` tem 8 BSS/BIH APIs (Party, Customer, Account, Bill,
Payment, PaymentMethods, Usage, ReferenceData) — o southbound de billing do CPR. Nota de escopo em
[`bss-billing-bih.md`](./bss-billing-bih.md): quase todas fora de escopo do prepaid self-care;
TMF632/629 validam o mapeamento do CPR, TMF666 fecha o ponto do billing account.

## O que a pesquisa mudou na spec da Fase 5

Ver `.kiro/specs/onboarding-journey/` (requirements/design/tasks) — as divergências que
afetam decisões **agora** (não só Fase 8) estão registradas lá e resumidas em
`docs/design/2025-02-14-onboarding-journey-contract-findings.md`.
