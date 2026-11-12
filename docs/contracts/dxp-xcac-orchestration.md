# XCAC / Journey Orchestration — Knowledge Base

> Resposta à pergunta "o que o XCAC faz e vamos ter que replicá-lo?". Resposta curta:
> **não replicamos** — o XCAC é o BFF do DXP, papel que o nosso `api.ts` + orquestração no
> cliente já cumprem; e ele está **depreciado** (substituído pelo Journey Mesh). Base a partir
> da doc interna do DXP indexada no Glean.

## Fontes (Glean — docs internos Ericsson)

- **XCAC — Level 3 Deep-Dive** — [DevPortal](https://devportal.internal.ericsson.com/docs/default/component/ericsson-dxp-xchanelapicntrl/xcac_deep_dive)
- **Product Overview — X-Channel API Control** — [DevPortal](https://devportal.internal.ericsson.com/docs/default/component/ericsson-dxp-xchanelapicntrl/product-overview)
- **DXP Journey Connection Patterns** (Pattern 1–6) — [DevPortal](https://devportal.internal.ericsson.com/docs/default/component/eric-dxp-microservice-sdk/dxp-journey-patterns-guide)
- **xCACcore API** (REST spec) — doc nº **155 19-FAY 302 346/2-V1**, rev. AC, v1.0.0 — CPI Store
- **Back End Flow with Journey Mesh User Guide** — CPI Store (prepaid onboarding BPMN)
- **DXP Technical Product Description** — DevPortal

---

## 1. O que o XCAC faz

O **Cross-Channel API Controller (XCAC)** é o **Backend-for-Frontend (BFF)** do DXP: um
microserviço Spring Boot entre os canais (CSR Toolbox, self-care, portais) e os serviços de
backend (CPR, EOC, SLCM, payment, connectors). Duas funções:

1. **Composite APIs** ("convenience APIs"): agregam N chamadas numa resposta — ex.: dado um
   `customerId`, retorna profile + contracts + subscriptions + balance + últimos pagamentos,
   combinando customer-management, CIS, subscription-management, payment-gateway. Comportamento
   **reutilizável** (mesmo padrão de orquestração para qualquer caso).
2. **Journey orchestration**: orquestra journeys de ponta a ponta em **código Java** — onboarding
   (prepaid/postpaid), recharge, plan change, SIM swap, suspend/resume, ~30 outras. Cada journey:
   valida payload, submete o shopping cart, dispara notificação, e **cria/atualiza Party
   Interactions** (registro de auditoria da jornada, visível no CSR panel).

**Endpoints reais (xCACcore API):**
- `POST /journey/submit` — submete uma journey.
- `PATCH /journey` — atualiza (o Order Manager chama pós-fulfillment).
- `POST /customerInteraction` + `/query` — interactions.
- `POST /journey/checkInvocationAllowed` — impede ordens paralelas no mesmo contract.
- `POST /customer/register`, `/customer/customerprofile/search`, `/customer/customercontract`…

No fluxo de onboarding (`CSRTB → JXC → XCAC → CPR → AEL → CPM`), o XCAC é o **coordenador**:
valida, chama o CPR pra criar party/customer, submete a ordem ao fulfillment, registra a
Party Interaction, e no sucesso a atualiza.

---

## 2. ⚠️ O XCAC está DEPRECIADO (substituído pelo Journey Mesh)

Confirmado na doc oficial (Product Overview + Journey Patterns):
> "XCAC (XChannel) is being replaced by the **Journey Mesh**. **All new composite APIs or backend
> journeys must be built in the Journey Mesh.**" O repo `eric-dxp-xcac-journey-orchestrator` foi
> **deprecado na release 22.7**.

- O **DXP Router** (`eric-dxp-journey-router`) direciona a execução para XCAC **ou** Journey Mesh
  por journey ID — os dois coexistem no cluster durante a transição.
- **Journey Mesh** = mesma capacidade, mas orquestração via **BPMN** (não Java-em-código).
- Um artefato interno de validação de blueprint DXP afirma: na arquitetura-alvo, **o contrato
  estável são as TMF Open APIs** (via MCP), não o XCAC — "XCAC é legado".

---

## 3. Por que NÃO replicamos o XCAC

**O XCAC é o BFF do DXP. Num app self-care moderno, a própria UI + a sua camada de porta são o
BFF.** O papel do XCAC já está distribuído no nosso app:

| O que o XCAC faz | Onde isso já vive no nosso app |
|---|---|
| Composite API (profile+contract+balance numa chamada) | **`api.getCustomer360`** — fan-out que compõe party/customer + installed base + balance (via `composeCustomer360`, regra pura) |
| Journey orchestration (validar → criar party/customer → submeter ordem → confirmar) | **A orquestração do submit** (`review`→`success`): `createParty → createCustomer → cart → submitOrder → getCustomer360` |
| Porta única por capacidade de negócio (BFF) | **`api.ts`** — a UI importa só `{ api, SeamFailure }`, nunca chama N serviços |
| Error mapping consistente entre canais | **`SeamResult`/`SeamFailure`** |
| Journey state / contexto em memória | **`OnboardingProvider`** (estado do wizard) |

Replicar o XCAC seria **recriar um orquestrador Java** (Spring Boot + Cassandra + Camunda/BPMN +
Kafka) — desproporcional para a nossa demo, fora do nosso stack, e copiando uma peça que a
Ericsson está aposentando. **Não fazer.**

**O que NÃO temos (e é ok não ter na demo):** as **Party/Customer Interactions** — o registro de
auditoria da jornada que o XCAC grava pro CSR panel. É um conceito de operação (visibilidade do
CSR), não do cliente final. Fica como dívida, não como bloqueio.

---

## 4. Impacto na Fase 8 (integração real) — a decisão que importa

A nossa orquestração **no cliente** (a UI chama `createParty`, `createCustomer`, `submitOrder` em
sequência) corresponde ao **Pattern 1 (Direct Call via FEE)** da doc de Journey Patterns. Mas há
três caminhos reais, e o nosso design de seams **acomoda qualquer um sem mexer na UI** (é só qual
driver HTTP o `cpr`/`order` usa):

| Opção | O que muda no real | Impacto na nossa UI |
|---|---|---|
| **A. Direct call (Pattern 1/FEE)** | `cpr-http` e `order-http` chamam os connectors direto via `/entryApi/v1/...` | Nenhum — é o que a spec já desenha |
| **B. Journey Mesh** (recomendado p/ novo) | `submitOrder` real vira **`POST /journey/submit`** com um journeyId (ex.: `prepaidOnboarding`); o backend orquestra party→customer→cart→contract→produtos→saldo via BPMN | `order-http.submitOrder` encapsula a submit-journey + polling; a UI não muda (já é async) |
| **C. TMF Open APIs via MCP** (arquitetura-alvo mais nova) | chamadas TMF diretas mediadas por MCP | contido nos drivers HTTP |

**Recomendação para a Fase 8:** se o deployment-alvo for DXP moderno, **Opção B (Journey Mesh)** é
a mais fiel — o `prepaidOnboarding` journey já existe (BPMN: `prepaidOnboarding_pre_submit` valida
customer+SIM, `_submit` processa, `_enrich_pi`/`_get_pi_update` atualizam a interaction). O nosso
`submitOrder` mapearia para um `POST /journey/submit` **assíncrono** — o que **reforça** o achado
D-ASYNC (o submit não é síncrono; volta e completa depois). A orquestração passo-a-passo do nosso
cliente é a simulação honesta disso no mock.

> **Conclusão:** não replicamos o XCAC. No mock, a nossa orquestração no cliente faz o papel dele
> (honestamente, e é o que a demo precisa). No real, trocamos para Journey Mesh (`/journey/submit`)
> **por baixo do seam `order`**, sem tocar a UI. Registrado como dívida/decisão da Fase 8.

---

## Dívidas / decisões Fase 8
- [ ] **Escolher o padrão de orquestração real** (Direct call vs **Journey Mesh** vs TMF/MCP). Default recomendado: Journey Mesh (`POST /journey/submit`, journey `prepaidOnboarding`).
- [ ] `order-http.submitOrder` → encapsular submit-journey + polling de estado (async, D-ASYNC).
- [ ] **Party/Customer Interaction** (auditoria da jornada p/ CSR) — não temos; avaliar se o produto precisa, senão dívida.
- [ ] `checkInvocationAllowed` — impede ordens paralelas no mesmo contract; relevante só se houver retomada/multi-ordem.
- [ ] Não implementar nada em XCAC (depreciado); mirar Journey Mesh se for orquestração de backend.
