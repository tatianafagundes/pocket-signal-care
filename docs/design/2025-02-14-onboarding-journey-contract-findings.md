# Achados da pesquisa dos contratos DXP — impacto na spec da Fase 5

Resultado de ler os 5 contratos OpenAPI reais do DXP (catálogo, qualificação, cart, ordering,
inventory) contra a spec `onboarding-journey`. Os knowledge bases completos estão em
`docs/contracts/` (um `.md` por contrato + `README.md`). Este doc resume **o que mudou na spec
por causa da pesquisa** e **o que ficou como dívida da Fase 8**.

Valeu a pena: a pesquisa confirmou quatro decisões e pegou **três divergências que afetam a
fase agora** — exatamente o objetivo de olhar os contratos antes de codar.

## Mudou AGORA na spec (mock reflete o shape real)

| # | Achado | Contrato | O que mudou |
|---|---|---|---|
| **D-ASYNC** | `submitOrder` real volta `acknowledged`, completa depois (`completed`/`partial`/`failed`); é orquestrado, não síncrono | TMF622 | `submitOrder` mock passa a ter status não-terminal; a tela de sucesso só afirma "ativado" no `completed`; `partial` = conta parcial; `failed` = erro terminal. Fortalece o V2 da revisão de produto. |
| **D-QUALIFY** | Qualificação é tri-estado (`qualified`/`unqualified`/`alternate`) + motivo (`terminationError.value`) + alternativa (`alternateProductOfferingProposal`), não booleano | TMF679 | `qualifyOffer` mock devolve `Qualification` (tri-estado), não `boolean`. A UI de "inelegível + motivo visível" (que a spec já exigia) exercita o shape real. `alternate` = gancho do Next Best Offer. Ajustar os poucos testes. |
| **D-CARTPRICE** | Fluxo de cart real tem `price`/`validate`/`present`/`accept` antes do `submit`; total vem do backend (`cartTotalPrice`) | TMF663 | O preço no `review` é rotulado "do catálogo" (`Offer.priceMinor`), não "total precificado pelo backend". Reforça o B1 (review montado na renderização). |

## Glean — doc interna do DXP (CPR, o seam real-able)

Além dos 5 YAMLs, busquei no Glean os docs internos do DXP que o usuário apontou (Customer
Management API, DXP REST Interface Use Cases, componente `customermgmtconn-db`). KB em
`docs/contracts/dxp-customer-management-cpr.md`. Achados:

| # | Achado | Impacto |
|---|---|---|
| **D-CPR** | Endpoints reais confirmados: `POST /customerManagement/v1/party`, `.../customer`, e **`GET /customerManagement/v1/customerview/{customerId}`** (a Customer 360). Fan-out CPR+SR+CBEV = o nosso `getCustomer360`. | Valida o seam. Sem mudança na UI. |
| **D-CONTRACT** | O real tem entidade **`contract`** (criada pelo EOC no fulfillment) sob a qual o plano vive. Não modelamos. | Dívida Fase 8; não bloqueia a demo. |
| **⚠️ Billing prepaid** | Fluxo SLCM real inclui "Create Billing Account" no onboarding prepaid; TMF622/HLD dizem "sem billing". Provável diferença de contexto (DMP full vs. DXP+Charging). | **Ponto em aberto registrado.** Mantida "sem billing"; confirmar na Fase 8. |
| Party duplicado | Regras reais (Active→Duplicate, Inactive→Not Active, multiAccount flag). | `createParty` real pode rejeitar → `SeamError(conflict)`. Dívida. |

## Confirmou (o design já estava certo)

- **Prepaid sem Billing Account** — o exemplo prepaid real do TMF622 não traz `billingAccount`
  (usa `relatedEntity role=CustomerAccount`). Decisão herdada correta.
- **SIM como produto separado** com `"<tenant>-sim-po"` — suportado pelo TMF637
  (`productRelationship`/`realizingResource`). Convenção nossa válida.
- **Tenant é header `X-Tenant-Id`** em todos — o `tenantId` no payload do nosso CPR é do modelo
  canônico; no HTTP real vai no header. Sem impacto na UI.
- **`createParty` precisa de `tenantId`** (schema real do CPR) — já corrigido na revisão anterior.

## Dívidas da Fase 8 (integração HTTP real — não afetam a demo)

- **Submit assíncrono:** `order-http.ts` submete → lê `id`/`href` → pollar `GET /productOrder/{id}`
  até terminal (ou evento `ProductOrderStateChangeEvent`; hub não exposto no contrato).
- **Fluxo de cart completo:** `addItem` via PATCH; passos `price`/`validate`/`setState(present/accept)`;
  capturar `orderId`+`externalOrderID`.
- **Qualificação assíncrona:** `qualify-http.ts` pede `instantSyncQualification:true` (200) e trata
  fallback 201→polling.
- **Dinheiro:** converter decimal `{unit,value}` ↔ `priceMinor` (cents) no `catalog-http.ts`.
- **Atributos como characteristics:** network/euRoaming/unlimited/validityDays/autoRenew não são
  campos nativos do TMF620 — vivem em `prodSpecCharValueUse`/`productOfferingChar`; mapper precisa
  de tabela name→campo (nomes dependem do catálogo ECM real).
- **`kind` por regex frágil:** derivar de `isBundle`+`productOffering`+`productRelationship` quando
  houver inventory real.
- **Auth:** `Authorization: Bearer <JWT>` em todos os seams HTTP.

## Natureza das fontes (verificado vs. não confirmado)

- **Verificado (lido do contrato):** schemas e campos citados nos KBs; os três achados que mudam
  a spec vêm de campos/descrições reais (`state`, `qualificationItemResult`, `instantSyncQualification`,
  o fluxo `price→present→accept→submit`).
- **Não confirmado (marcado nos KBs):** o exemplo prepaid do TMF637 (`components.examples` além do
  limite de leitura do sub-agente — reabrir pretty-printed); o header Auth do TMF679; transições
  exatas de estado do TMF622 (inferidas dos enums). Nada disso bloqueia a Fase 5.
