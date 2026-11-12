# TMF679 Product Offering Qualification — Knowledge Base

> Base de conhecimento para implementar/validar a nossa qualificação de oferta (`qualifyOffer`)
> no app self-care MVNO prepaid (Drei/DreiGo). Todo trecho abaixo foi lido do contrato real;
> o que não consta está marcado. Nada inventado.

## Fonte

- **Arquivo:** `contracts/dxp-reference/commercial-browsing-po-qualification-v4.yaml`
- **`info.title`:** Commercial Browsing
- **`info.version`:** **4.6**
- **`openapi`:** 3.0.1
- **TMF:** TMF679 Product Offering Qualification (POQ), parte do Commercial Browsing do DXP.
- **Paths:** `POST /productOfferingQualification/v4/productOfferingQualification`,
  `GET …/{productOfferingQualificationId}`, `GET …/schema/{schemaId}`.

> Método: lido via `python3 -c` + `yaml.safe_load` direto no arquivo (o grep do workspace não
> indexa `contracts/`). Schemas `ProductOfferingQualification`, `…Item`,
> `AlternateProductOfferingProposal`, `TerminationError` lidos de verdade.

---

## 1. O que é um POQ — síncrono ou assíncrono, fluxo, estado

Um **ProductOfferingQualification (POQ)** pergunta ao catálogo/commerce se uma (ou várias)
ofertas são **adquiríveis** num contexto (party, carrinho, características) — e, se não forem,
**propõe alternativas**. É o mecanismo canônico por trás do nosso `qualifyOffer`.

**Síncrono OU assíncrono — controlado pelo requester** (campo real):

- `instantSyncQualification: boolean` — descrição literal:
  > "quando `true`, o requester espera o resultado **imediatamente na resposta**. Se `true`, o
  > código **200** indica sucesso; caso contrário é criada uma **task** com resposta **201**."

Ou seja:
- `instantSyncQualification: true` → **POST 200** com o resultado preenchido na hora (síncrono).
- `instantSyncQualification: false`/ausente → **POST 201** cria um recurso/task; o resultado
  chega depois via **`GET /{id}`** (assíncrono, mesmo padrão do ProductOrder no TMF622).

**Estado (ciclo de task):** `ProductOfferingQualification.state: string` — valores reais do
contrato: **`terminatedWithError`, `done`** (idem no nível do item). Então um POQ assíncrono vai
de criado → `done` (ou `terminatedWithError`), e o cliente pollar `GET /{id}` até terminal.

---

## 2. Entradas — o que o POST recebe

Schema `ProductOfferingQualification` (nenhum `required` declarado; campos relevantes):

| Campo | Tipo | Para quê |
|---|---|---|
| `instantSyncQualification` | boolean | pede resultado síncrono (200) vs task (201) |
| `provideOnlyAvailable` | boolean | "só retorne o que está disponível" |
| `productOfferingQualificationItem` | array`<…Item>` | **os itens a qualificar** (um por oferta) |
| `relatedParty` | array`<RelatedPartyRef>` | a party/cliente no contexto (opcional p/ visitante) |
| `category` | `CategoryRef` | contexto de categoria |
| `contextCharacteristic` | array`<EntityCharacteristic>` | características de contexto (ex.: canal, região) |
| `contextSpecification` | `CatalogEntityRef` | contexto de catálogo |
| `shoppingCartId` | string | liga a qualificação a um carrinho |
| `effectiveQualificationDate` / `requestedPOQCompletionDate` | DateTime | datas |
| `expand` / `productOfferingExpandDepth` / `returnedProductOfferingFields` | — | controle do que volta |

Schema `ProductOfferingQualificationItem` (um item = uma oferta sendo qualificada):

| Campo | Tipo | Para quê |
|---|---|---|
| `id` | string | id do item |
| `productOffering` | `ProductOfferingReforValue` (`@type` req) | **a oferta desejada** (o nosso `offerId`) |
| `product` | `Product` | produto configurado (características desejadas) |
| `productOfferingFilter` | string | expressão de filtro complexa |
| `expectedActivationDate` | string | quando o cliente quer ativar |
| `qualificationItemResult` | string | **o resultado** (ver §3) |
| `alternateProductOfferingProposal` | array`<…Proposal>` | **alternativas** (ver §4) |
| `state` | string (`done`/`terminatedWithError`) | estado do item |
| `terminationError` | array`<TerminationError>` | **erro/motivo** (ver §3) |

---

## 3. Saída — elegível vs inelegível + MOTIVO (o que a UI precisa)

Dois níveis de resultado:

- **Nível POQ:** `qualificationResult: string` — "Result of the qualification (**example: green,
  yellow, red**)." Um semáforo agregado.
- **Nível item:** `qualificationItemResult: string` — descrição literal, **três valores**:
  - **`qualified`** — "requested productOffering or productSpecification **are available**".
  - **`unqualified`** — "requested **not available and no alternate** available".
  - **`alternate`** — "requested **not available but proposal available**".

**MOTIVO visível (o que a nossa UI exige para `aria-disabled` + razão):**
- `ProductOfferingQualificationItem.terminationError: array<TerminationError>`, e
  `TerminationError = { id, value }` — o `value` é o texto do porquê. É daí que sai o motivo
  da inelegibilidade.
- Combinação para a UI: `qualificationItemResult = unqualified` + `terminationError[].value`
  como motivo visível; `alternate` → mostrar a alternativa (§4) em vez de só bloquear.

> **Atenção (honesto):** o contrato dá o *mecanismo* do motivo (`terminationError.value`,
> semáforo `qualificationResult` green/yellow/red). Os **códigos/textos concretos** de motivo
> dependem do backend (não há enum fixo). Não hardcodar textos — mapear `terminationError.value`
> → chave i18n no futuro `qualify-http.ts`.

---

## 4. Alternativas de oferta — sim, existe (ouro pro recommendation assist)

- `ProductOfferingQualificationItem.alternateProductOfferingProposal: array<AlternateProductOfferingProposal>`.
- `AlternateProductOfferingProposal = { id, alternateProductOffering: ProductOfferingReforValue }`.

Quando `qualificationItemResult = alternate`, o POQ devolve **qual(is) oferta(s) substituta(s)**
propor. Isso é exatamente um **"Next Best Offer" nativo do commerce** — o nosso recommendation
assist determinístico (regra pura) pode, no futuro, ser **substituído ou complementado** por
essa saída: mesmo contrato de UI ("sugerido: X porque a desejada não está disponível").

> Conecta com o `tmf620`/`recommendation-rules` da nossa spec: a assinatura
> `recommend(answers, offers): Recommendation` continua, mas a fonte da sugestão pode migrar de
> regra local → `alternateProductOfferingProposal` do POQ, sem mudar a tela.

---

## 5. Tenant / canal / auth

- **Tenant:** header **`X-Tenant-Id`** — "The tenant of the current request. Should be provided
  only when multitenant[cy]". Mesmo padrão dos outros contratos DXP (header, não campo/query).
- **Canal/contexto:** via `contextCharacteristic[]` (`EntityCharacteristic` name/value) e/ou
  `contextSpecification` — é onde "canal = self-care", "região = AT" entrariam. Não há um campo
  `channel` de primeira classe.
- **Paginação:** header `Range` (ex.: `items=1-2`), como nos outros.
- **Auth:** o contrato não detalha o header Authorization nesta amostra lida; assumir Bearer JWT
  como nos irmãos DXP (confirmar). *(não confirmado neste arquivo)*

---

## Tabela: nosso `qualifyOffer` ↔ TMF679

| Nosso `qualifyOffer(offerId, ctx)` | TMF679 real | Observação |
|---|---|---|
| `offerId` | `productOfferingQualificationItem[].productOffering.id` | 1 item por oferta; dá para qualificar várias de uma vez |
| `ctx` (customerId, saldo…) | `relatedParty[]` + `contextCharacteristic[]` + `shoppingCartId` | visitante: sem `relatedParty`; contexto via characteristics |
| retorno `{ eligible: true }` | `qualificationItemResult` ∈ `qualified\|unqualified\|alternate` + `qualificationResult` (green/yellow/red) | **não é booleano** — é tri-estado + semáforo |
| *(hoje sem motivo)* | `terminationError[].value` | **motivo visível** da inelegibilidade |
| *(hoje sem alternativa)* | `alternateProductOfferingProposal[]` | **Next Best Offer** nativo |
| síncrono | `instantSyncQualification:true` → 200 síncrono; senão 201 + `GET /{id}` | podemos pedir o modo síncrono |
| tenant no arg | header `X-Tenant-Id` | tenant é header |

---

## 6. Divergências e impacto na spec / Fase 8

### O nosso contrato de UI aguenta?
**Em grande parte sim, com um ajuste de modelo.** Hoje `qualifyOffer` devolve um booleano
`eligible`. O real devolve **tri-estado** (`qualified`/`unqualified`/`alternate`) + **motivo**
(`terminationError.value`) + **alternativa**. A boa notícia: a nossa spec **já** exige
"inelegível + motivo visível" e **já** tem o recommendation assist — ou seja, o contrato real
é *mais rico* do que o nosso booleano, mas **cabe** no que a UI já prevê. O ajuste é trocar o
retorno de `boolean` para algo como `{ result: 'qualified'|'unqualified'|'alternate', reason?,
alternativeOfferId? }`.

### Síncrono vs assíncrono
Podemos pedir `instantSyncQualification: true` e tratar como síncrono (200) — **a nossa UI
síncrona funciona**. Mas o backend pode responder 201 (task) se não suportar sync para aquele
caso; então o `qualify-http.ts` precisa lidar com os dois (se 201, pollar `GET /{id}` até
`state: done`). Mesmo padrão assíncrono do ProductOrder (TMF622) — tratar os dois num lugar só.

### Impacto AGORA na spec (pequeno, mas vale)
1. **Refinar o shape do `qualifyOffer` no mock** para já devolver o tri-estado + motivo
   (`unqualified` + reason), em vez de só `eligible: boolean`. Assim a UI de "oferta inelegível
   + motivo visível" (que a spec exige) exercita o shape real desde o mock, e a migração pra
   `qualify-http.ts` não muda a UI. **Baixo custo, alto alinhamento.**
2. **Ligar o recommendation assist ao gancho `alternate`:** documentar que a sugestão pode vir
   de `alternateProductOfferingProposal` no futuro — a nossa regra determinística é o
   placeholder, o POQ é a fonte real. (Já está coerente com a spec.)

### Dívidas Fase 8 (`qualify-http.ts`)
- [ ] Suportar `instantSyncQualification: true` (200) **e** o fallback assíncrono (201 → pollar
  `GET /{id}` até `state: done`/`terminatedWithError`).
- [ ] Mapear `qualificationItemResult` → UI: `qualified` (elegível), `unqualified`
  (bloqueia + `terminationError.value` como motivo), `alternate` (sugere
  `alternateProductOfferingProposal`).
- [ ] Mapear `qualificationResult` (green/yellow/red) se quisermos um semáforo agregado.
- [ ] Tenant via header `X-Tenant-Id`; contexto (canal/região) via `contextCharacteristic[]`.
- [ ] Confirmar o header de auth (Bearer JWT) — não detalhado nesta leitura.
- [ ] `terminationError.value` → chave i18n (não hardcodar texto do backend).

### Lacunas / não confirmado
- Header `Authorization` não detalhado nesta amostra (assumido Bearer JWT como nos irmãos).
- Valores concretos de `terminationError.value` e dos códigos de motivo dependem do backend
  (sem enum no contrato).
- Bloco `examples` não extraído; os campos acima vêm dos **schemas**, que foram lidos.
