# TMF622 Product Ordering Management v5 — Knowledge Base

> Base de conhecimento para implementar e validar o **submit de pedido** no onboarding
> do app self-care MVNO prepaid (Drei / DreiGo). Todo trecho abaixo foi extraído do
> contrato OpenAPI real; o que não está no contrato está marcado como **não consta**.

## Fonte

- **Arquivo:** `contracts/dxp-reference/product-ordering-management-v5.yaml`
- **`openapi:`** `3.0.1`
- **`info.title`:** `TMF 622 - Product Ordering Management REST Interface version 5.0`
- **`info.version`:** `5.0.0`
- **Data declarada na descrição:** January 2025
- **Base path (servers):** `https://{host}/eoc/productOrderingManagement/v5/`
- Entidades com sufixo `Ext` / `@baseType` próprio são extensões EOC (Ericsson) sobre o TMF.
  O corpo do POST de criação usa `ProductOrderExt` (ver `requestBodies.ProductOrder_Create`).

> Nota de método: o `grep` do workspace não indexa esta pasta (o repo do contrato está
> fora da raiz indexada), então a navegação foi feita por leitura direta do arquivo.
> Os paths e enums abaixo foram lidos linha a linha; onde eu afirmo "não existe", é porque
> a seção correspondente foi lida inteira e o item não aparece.

---

## Endpoints (seção `paths`)

Lidos na ordem em que aparecem no arquivo. A seção `paths` termina em
`/cancelProductOrder/{id}` e então começa `components:`.

| Método | Path | operationId | Resposta de sucesso |
|---|---|---|---|
| GET | `/productOrder` | `listProductOrder` | 200 / 206 (parcial) |
| POST | `/productOrder` | `createProductOrder` | **201** (+ header `Location`) |
| GET | `/productOrder/{id}` | `retrieveProductOrder` | 200 |
| DELETE | `/productOrder/{id}` | `deleteProductOrder` | 204 (só fora de Acknowledged/In Progress) |
| PATCH | `/productOrder/{id}` | `patchProductOrder` | 200 |
| POST | `/productOrder/{id}/revise` | `reviseProductOrder` | 201 (cancela o pedido original) |
| POST | `/productOrder/{id}/{task}` | `performTaskProductOrder` | 204 — task = **Cancel, Suspend, Resume, Run** |
| GET | `/cancelProductOrder` | `listCancelProductOrder` | 200 / 206 |
| POST | `/cancelProductOrder` | `createCancelProductOrder` | 201 (+ header `Location`) |
| GET | `/cancelProductOrder/{id}` | `retrieveCancelProductOrder` | 200 |

**Observações relevantes para o nosso fluxo:**

- O `revise` (`/productOrder/{id}/revise`) **cancela o pedido original** e cria um novo — não é um "editar".
- Não há endpoint de cancelamento direto por verbo; cancelar é ou `POST /cancelProductOrder`
  (recurso task-based, com estado próprio) ou `POST /productOrder/{id}/Cancel`.

---

## 1. Schema `ProductOrder` — campos e como referencia customer/oferta

`ProductOrder` = `ProductOrderBase` + estes campos:

```yaml
ProductOrder:
  allOf:
    - $ref: '#/components/schemas/ProductOrderBase'
    - type: object
      properties:
        orderTotalPrice: { type: array, items: { $ref: '.../OrderPrice' } }
        productOrderItem:
          type: array
          items: { $ref: '#/components/schemas/ProductOrderItem' }
          minItems: 1          # <= único "obrigatório" explícito via minItems
```

### Obrigatoriedade (fato vs. inferência)

- **Fato:** o único requisito estrutural explícito é `productOrderItem` com `minItems: 1`.
  **Não existe** bloco `required:` em `ProductOrderBase` nem em `ProductOrder`/`ProductOrderExt`
  listando `relatedParty`, `billingAccount` ou `state` como obrigatórios no schema.
- **Inferência (hipótese):** na prática o backend EOC exige `relatedParty role=Customer`
  e `productOffering` por item para orquestrar — os exemplos reais sempre os trazem, e há
  um erro de query `CWT_DO_ORDERING_0006` exigindo `relatedParties.reference`. O schema não
  obriga; a regra de negócio aparenta obrigar. Validar contra o ambiente real.

### Campos de `ProductOrderBase` (os que importam para nós)

```yaml
ProductOrderBase:          # allOf: EntityExt + ...
  properties:
    billingAccount: { $ref: '.../BillingAccountRef' }     # presente, NÃO em required
    state:          { $ref: '.../ProductOrderStateType' }
    relatedParty:
      type: array
      items: { $ref: '.../RelatedPartyRefOrPartyRoleRef' }
    productOrderErrorMessage: [ ... ]   # erros que mudam o estado do pedido
    productOrderJeopardyAlert: [ ... ]  # risco previsto de não completar
    productOrderMilestone:     [ ... ]  # marcos do processamento
    requestedCompletionDate: date-time
    requestedStartDate:      date-time
    creationDate:            date-time
    completionDate:          date-time  # preenchido quando completa
    cancellationDate / cancellationReason
    topicRef: string   # endpoint Kafka / prefixo do reply-channel da resposta
```

### Campos extras de `ProductOrderExt` que decidem SÍNCRONO × ASSÍNCRONO

```yaml
ProductOrderExt:
  properties:
    executionMode: string  # "synchronous" ou "asynchronous". Default: synchronous
    requestMode:   string  # "Sync" (default) ou "Async".
                           #   Async => retorna só id + poucos campos de sistema
    mode:          string  # INTERACTIVE / NON-INTERACTIVE
    run:           boolean # roda automático após criação; se requestedStartDate futuro => PENDING
    tenant:        string  # identificador do tenant
    orderType:     string  # default: ProductOfferingOrder
    submittedDate: string  # data de submissão vinda do Shopping Cart
    scId (no item) / shoppingCartId (filtro)  # ligação com o carrinho
    externalProcessEngine: { type, processId }  # processo de orquestração (ex.: "PC")
```

### Como o order referencia **customer/party** e **oferta**

Trecho real (envelope de resposta, exemplo `searchProductOrderExt...`), reduzido:

```jsonc
{
  "@type": "ProductOrderExt",
  "@baseType": "ProductOrder",
  "state": "acknowledged",
  "relatedParty": [                              // <= customer no nível do PEDIDO
    {
      "@type": "RelatedPartyRefOrPartyRoleRef",
      "role": "Customer",
      "partyOrPartyRole": { "@type": "PartyRef", "id": "2372912422994485" }
    }
  ],
  "relatedEntity": [
    { "@type": "RelatedEntity", "role": "CustomerAccount", "reference": "2372912422994485" }
  ],
  "orderType": "ProductOfferingOrder",
  "isBundled": "false"
  // >>> NENHUM "billingAccount" neste exemplo prepaid <<<
}
```

- **Customer/party:** `relatedParty[].partyOrPartyRole` (`PartyRef`/`PartyRoleRef`) com `role: "Customer"`.
  Aparece no nível do pedido **e** pode aparecer dentro do item (`product.relatedParty`).
- **Oferta:** cada item traz `productOffering` (`ProductOfferingRef(Ext)`) com `id` (ex.: `PO_PRE_SIM_CARD`).

---

## 2. `ProductOrderItem` — action / productOffering / product / quantity

```yaml
ProductOrderItem:                      # allOf: ProductOrderItemBase + ...
  properties:
    product:        { $ref: '.../ProductRefOrValue' }
    productOffering: { $ref: '.../ProductOfferingRef' }
    itemPrice:      [ { $ref: '.../OrderPrice' } ]

ProductOrderItemBase:
  properties:
    quantity: { type: integer }
    action:   { type: string }          # "The action to be performed on the entity"
    billingAccount: { $ref: '.../BillingAccountRef' }   # também existe no item, NÃO obrigatório
    state:    { $ref: '.../ProductOrderItemStateType' }
    id:       { type: string }          # sequência 01, 02, 03...
    productOrderItemRelationship: [ { $ref: '.../OrderItemRelationship' } ]
```

### `action`

- No schema `action` é **string livre** (sem enum). Valores reais vistos nos exemplos:
  `"add"`, `"modify"`, `"suspend"` (e as tasks de pedido `Cancel/Suspend/Resume/Run`).
  O enunciado de add/modify/delete é convenção TMF; o contrato **não** restringe por enum.

### Como expressar "ativar plano prepaid + SIM + número"

**Evidência real (exemplo de resposta prepaid):** são **itens separados**, um por componente,
cada um com seu `productOffering`:

- Item com `productOffering.id = "PO_PRE_SIM_CARD"`  — o cartão SIM
- Item com `productOffering.id = "PO_PRE_MSISDN_STD"` — o número (MSISDN)
  - esse item "realiza" os recursos `PRS_PRE_SIM_CARD` (com `imsi`, `pin`, `puk`, `sku`,
    `serialNumber`) e `LRS_PRE_MSISDN` (o número), e serviços `CFSS_PRE_ACCESS`, etc.
- (plano/service class) — os serviços prepaid aparecem como `CFSS_PRE_VOICE_NAT_UNL`,
  `CFSS_PRE_DATA_NAT`, `CFSS_PRE_SC_MAX` (service class), ligados por `supportingService`.

Cada item carrega `action: "add"` e `state` próprio. Exemplo reduzido de **um** item:

```jsonc
{
  "@type": "ProductOrderItemExt",
  "action": "add",
  "productOffering": { "@type": "ProductOfferingRefExt", "id": "PO_PRE_SIM_CARD",
                       "effectiveDate": "2025-02-14T12:56:35Z" },
  "product": {
    "@type": "ProductExt",
    "relatedParty": [ { "role": "Customer",
                        "partyOrPartyRole": { "@type": "PartyRoleRef", "id": "9999" } } ],
    "relatedEntity": [ { "role": "Contract", "reference": "3JI" },
                       { "role": "CustomerAccount", "reference": "2372912422994485" } ]
  },
  "state": "completed",
  "description": "PO_PRE_SIM_CARD"
}
```

### Bundle × itens separados

- Há `isBundle` no `product` e `isBundled` no pedido; o relacionamento entre itens é expresso
  por `productOrderItemRelationship` com `ProductOrderItemRelationshipType`:

  ```yaml
  ProductOrderItemRelationshipType:
    enum: [ migratesTo, bundles, bundledBy, reliesOn, enables,
            requires, dependsOn, brings ]
  ```

- **Fato:** no exemplo prepaid real os componentes são **itens distintos** (SIM, MSISDN, serviços),
  não um único item bundle. "SIM depende do número", "número habilita acesso" etc. seriam
  modeláveis via `bundles`/`reliesOn`/`enables` — mas **não há** no contrato um exemplo
  mostrando esses relationships preenchidos entre SIM/plano/número (não consta).

---

## 3. Estados do `ProductOrder` — ciclo de vida e síncrono vs. assíncrono

### Enum de estado do PEDIDO

```yaml
ProductOrderStateType:
  enum:
    - draft
    - acknowledged
    - pending
    - held
    - inProgress
    - inProgress.accepted
    - rejected
    - completed
    - failed
    - partial                 # <= conta parcial: alguns itens ok, outros não
    - cancelled
    - assessingCancellation
    - pendingCancellation
```

### Enum de estado do ITEM

```yaml
ProductOrderItemStateType:
  enum:
    - acknowledged, rejected, pending, held, inProgress,
      cancelled, completed, failed, partial,
      assessingCancellation, pendingCancellation
```

### Enum de estado da TASK (cancel/suspend/resume/run)

```yaml
TaskStateType:
  enum: [ acknowledged, rejected, inProgress, cancelled, done, terminatedWithError ]
```

### Diagrama de estados (texto)

```
            POST /productOrder
                   |
                   v
             [acknowledged] ───(requester ainda editando)──> [draft]
                   |                                             |
                   | (fulfillment inicia)                        | (submit)
                   v                                             v
               [inProgress] ──────────────────────────> [inProgress.accepted]
               /    |     \                 \
              v     v      v                 v
        [pending] [held]  (erro em item)   (segue)
                               \                \
                                v                v
                            [failed]          [completed]   <-- todos os itens completos
                                                  ^
                                                  |
                           alguns itens ok, outros não
                                                  |
                                              [partial]

   Cancelamento:  [assessingCancellation] -> [pendingCancellation] -> [cancelled]
   Rejeição na entrada:                        [rejected]
```

> O diagrama acima combina os estados do enum com as transições descritas em texto no
> contrato (ex.: DELETE barrado em Acknowledged/In Progress; PATCH condicional "se o
> fulfillment ainda não começou"). As setas exatas entre estados **não** são especificadas
> formalmente no OpenAPI — é um modelo inferido a partir dos nomes e das regras de PATCH/DELETE.

### Síncrono ou assíncrono?

**Assíncrono por padrão de orquestração.** Evidências no contrato:

1. **POST retorna `201` com estado `acknowledged`**, não `completed`. Exemplo real de resposta
   de criação (`CreateProductOrderExt_suspend_item_response`): `"state": "acknowledged"`.
2. `ProductOrderExt.executionMode` existe exatamente para alternar `synchronous`/`asynchronous`
   (default `synchronous` no **modo de execução**), e `requestMode` `Sync`/`Async` controla se o
   POST responde só com `id` + campos de sistema.
3. O pedido referencia um **motor de processo externo**: `externalProcessEngine: { type: "PC",
   processId: "..." }` e `orderSpecification.characteristics` com `fpsId: "PC:OrderOrchestration"`.
   Isso é um fulfillment orquestrado, não um commit em uma chamada.
4. Existem `ProductOrderMilestone`, `ProductOrderJeopardyAlert` e `ProductOrderErrorMessage`
   no próprio pedido — só fazem sentido num processamento que dura no tempo.
5. Existe `ProductOrderStateChangeEvent` (ver seção 6): o backend **notifica** mudança de estado.

> **Conclusão (confiança alta):** mesmo quando `executionMode=synchronous`, o pedido entra
> como `acknowledged`/`inProgress` e **completa depois**. O estado terminal (`completed` /
> `partial` / `failed`) chega por **polling** (`GET /productOrder/{id}`) ou por **evento**
> (`ProductOrderStateChangeEvent`). Não é garantido que `completed` volte na resposta do POST.

---

## 4. Billing Account é obrigatório? (prepaid sem billingAccount)

- **Fato (schema):** `billingAccount` (`BillingAccountRef`) existe em `ProductOrderBase`
  e em `ProductOrderItemBase`, mas **não** aparece em nenhum bloco `required:`.
- **Fato (exemplo real prepaid):** o exemplo prepaid (itens `PO_PRE_SIM_CARD` /
  `PO_PRE_MSISDN_STD`, serviços `CFSS_PRE_*`) **não inclui** `billingAccount`. O vínculo
  comercial aparece como `relatedEntity role=CustomerAccount`, não como billing account.

> **Conclusão (confiança alta):** o contrato permite submeter um pedido **sem** `billingAccount`,
> e o exemplo prepaid real confirma. Para prepaid, usar `relatedParty role=Customer` +
> `relatedEntity role=CustomerAccount`; **não** enviar `billingAccount`.

---

## 5. Tenant (`X-Tenant-Id`) e autorização (Bearer JWT)

Ambos são parâmetros de header padrão, aplicados em POST/GET/PATCH/DELETE/revise/cancel.

### `Authorization` (parâmetro)

- Header `Authorization` usando **JWT (Bearer)**.
- Texto do contrato: *"The Authorization header uses the JSON Web Token (JWT) for authentication
  and authorization"*; exemplo `Authorization: Bearer eyJ...`.
- Erro real de token inválido/expirado (exemplo `invalidOrMissingTokenResponseError`):

  ```json
  { "code": "0012", "reason": "Listener error ... Invalid or expired Token.", "status": "401" }
  ```

### `X-Tenant-Id` (parâmetro)

- Header `X-Tenant-Id`, **usado só em modo multitenancy**.
- **Obrigatório** apenas se o JWT tiver **mais de um tenant** associado. Com um único tenant,
  é opcional e é inferido do próprio JWT. Fora de multitenancy, enviar `X-Tenant-Id` gera erro.
- Existe também o campo `tenant` no corpo (`ProductOrderExt.tenant`), distinto do header.

> Outros headers do contrato: `Content-Type` (`application/json`; PATCH aceita
> `application/merge-patch+json`), `Multi-Language Support` (accept-language), `API version`.

---

## 6. Notificações / eventos — o pedido avisa quando completa?

**Sim, há eventos; mas NÃO há endpoint de assinatura (`/hub` ou `/listener`) neste arquivo.**

- **Fato:** a seção `paths` termina em `/cancelProductOrder/{id}`. **Não existe** `/hub`
  nem `/listener` nos paths deste contrato. (Existe o schema `Hub`/`HubExt` em `components`,
  mas nenhuma rota que o exponha aqui.)
- **Fato:** existem schemas e `requestBodies` de eventos — ou seja, o POM **faz POST** desses
  payloads para um callback de listener registrado em outro lugar:
  - `ProductOrderCreateEvent`
  - `ProductOrderStateChangeEvent`   ← avisa mudança de estado (inclui chegar a `completed`/`partial`/`failed`)
  - `ProductOrderAttributeValueChangeEvent`
  - `ProductOrderDeleteEvent`
  - `ProductOrderInformationRequiredEvent`  (pede mais dados via `JsonPatch`)
  - `ProductOrderMilestoneEvent`, `ProductOrderJeopardyAlertEvent`, `ProductOrderErrorMessageEvent`

> **Conclusão:** o "quando completa?" chega por `ProductOrderStateChangeEvent` **se** houver
> um listener/callback registrado. Como o registro do hub **não consta** neste contrato, no MVP
> o caminho garantido é **polling** de `GET /productOrder/{id}` até estado terminal. Confirmar
> com a plataforma se o hub é exposto por outra API EOC.

---

## 7. DIVERGÊNCIAS CRÍTICAS — nosso `submitOrder` × TMF622 real

### Como é hoje (mock)

`order-mock.submitOrder(cartId)` → `{ orderId, status: 'completed' }` **na hora**, e já
provisiona produtos na installed base. A spec da Fase 5 orquestra
`createParty → createCustomer → createCart → addItem(plano) → addItem(SIM-PO) → submitOrder → getCustomer360`.

### Mapa `nosso submitOrder ↔ TMF622 real`

| Nosso mock | TMF622 v5 real | Divergência / ação |
|---|---|---|
| `submitOrder(cartId)` → 1 chamada | `POST /productOrder` (corpo `ProductOrderExt`) → **201** | Precisa montar `productOrderItem[]` + `relatedParty`; não é só `cartId`. Ligação ao carrinho via `scId`/`shoppingCartId`. |
| retorno `status: 'completed'` | resposta vem como **`state: 'acknowledged'`** | **Divergência central.** Real não volta `completed` no POST. |
| síncrono (provisiona na resposta) | assíncrono/orquestrado (`externalProcessEngine`, `fpsId: PC:OrderOrchestration`) | Provisionamento acontece **depois**; nosso mock finge que já terminou. |
| sem conceito de estado intermediário | `acknowledged → inProgress → completed \| partial \| failed` | Falta estado "em processamento" e os terminais `partial`/`failed`. |
| `orderId` plano | `id` + header `Location` apontando para o recurso | Guardar `id`/`href` para o polling. |
| sem billing | prepaid **sem** `billingAccount` (ok) | Alinhado — não enviar billingAccount. |
| sem auth/tenant | `Authorization: Bearer <JWT>` + `X-Tenant-Id` (se multi-tenant) | Cliente precisa injetar JWT e, em multitenancy, o tenant. |
| sem notificação | `ProductOrderStateChangeEvent` (hub não exposto aqui) | MVP: polling; evento depende de hub externo. |
| itens = (plano, SIM-PO) | 1 item por componente, cada um com `productOffering` (`PO_PRE_SIM_CARD`, `PO_PRE_MSISDN_STD`, service class) + `action: "add"` | Expandir o addItem para refletir SIM + número + plano como itens. |

### O `submitOrder` síncrono que volta `completed` é realista?

**Não.** O contrato real responde `acknowledged` e completa depois via orquestração. Tratar
`completed` como resposta imediata do POST induz a tela de sucesso a mentir: o número/SIM pode
ainda não estar ativo quando mostramos "pronto". Isso conecta diretamente ao caso de **erro
terminal / conta parcial** já previsto na spec: o real tem `partial` (alguns itens `completed`,
outros `failed`) e `failed` como estados de primeira classe — exatamente o cenário de "conta
parcial".

### O que o `order-http.ts` real precisa fazer

1. **Submeter:** `POST /productOrder` com `ProductOrderExt`:
   - `productOrderItem[]` (um por componente; cada item com `action: "add"` + `productOffering.id`),
   - `relatedParty role=Customer` (`partyOrPartyRole.id` = party criado na Fase 5),
   - `relatedEntity role=CustomerAccount`,
   - **sem** `billingAccount` (prepaid),
   - ligação ao carrinho (`scId`/`shoppingCartId`) conforme a plataforma aceitar.
   - Headers `Authorization: Bearer <JWT>` e `X-Tenant-Id` quando multi-tenant.
2. **Ler o 201:** guardar `id` + `href` (do `Location`); estado esperado `acknowledged`.
3. **Pollar estado:** `GET /productOrder/{id}` até terminal:
   - `completed` → sucesso total,
   - `partial` → sucesso parcial (tratar como "conta parcial" da spec),
   - `failed`/`rejected` → erro terminal,
   - com backoff e timeout; expor `productOrderErrorMessage` e `productOrderMilestone` para UX/diagnóstico.
4. **(Opcional/futuro) Ouvir evento:** consumir `ProductOrderStateChangeEvent` **se** houver hub
   exposto por outra API EOC (não consta aqui) — substitui/complementa o polling.

### Mínimo real para o POST (exemplo do contrato, reduzido)

```yaml
# baseado em CreateProductOrderExt_*_request (forma mínima do envelope)
'@type': ProductOrderExt
description: Onboarding prepaid DreiGo
relatedParty:
  - '@type': RelatedPartyRefOrPartyRoleRef
    role: Customer
    partyOrPartyRole: { '@type': PartyRoleRef, '@referredType': Customer, id: '<PARTY_ID>' }
relatedEntity:
  - { role: CustomerAccount, reference: '<CUSTOMER_ACCOUNT>', '@type': RelatedEntity }
mode: INTERACTIVE
requester: <requester>
productOrderItem:
  - '@type': ProductOrderItemExt
    action: add
    productOffering: { '@type': ProductOfferingRef, id: PO_PRE_SIM_CARD }
    orderType: ProductOfferingOrder
  - '@type': ProductOrderItemExt
    action: add
    productOffering: { '@type': ProductOfferingRef, id: PO_PRE_MSISDN_STD }
    orderType: ProductOfferingOrder
# (+ item do plano/service class conforme catálogo)
orderSpecification: { name: ProductOrder }
# SEM billingAccount (prepaid)
```

---

## 8. Dívidas da Fase 8 + impacto na UX do onboarding

### Dívidas técnicas (Fase 8)

- **D1 — Modelo assíncrono no cliente.** `order-http.ts` precisa: submeter → ler `id`/`href` →
  **pollar** `GET /productOrder/{id}` até terminal. Hoje o mock colapsa isso em uma chamada.
- **D2 — Estados terminais além de "completed".** Tratar `partial`, `failed`, `rejected`
  explicitamente (hoje só existe `completed`). Mapear para o "erro terminal / conta parcial" já
  na spec.
- **D3 — Montagem dos itens.** Expandir `addItem` para emitir um `productOrderItem` por componente
  (SIM `PO_PRE_SIM_CARD`, número `PO_PRE_MSISDN_STD`, plano/service class) com `action: "add"`
  e `productOffering.id`. Confirmar os IDs de offering reais no catálogo do ambiente.
- **D4 — Auth/tenant.** Injetar `Authorization: Bearer <JWT>`; decidir `X-Tenant-Id` (só multi-tenant).
- **D5 — Notificação vs. polling.** Confirmar se existe hub/listener exposto por outra API EOC
  (não consta neste contrato). Enquanto não, polling é o caminho oficial.
- **D6 — Timeout/backoff e diagnóstico.** Política de polling (intervalo, limite) e superfície para
  `productOrderErrorMessage` / `productOrderMilestone`.
- **D7 — Prepaid sem billing.** Garantir que o cliente **nunca** envie `billingAccount` no fluxo prepaid.

### Impacto na UX do onboarding

- **O "success" imediato está errado.** Como o POST volta `acknowledged`, a tela precisa de um
  estado **"Ativando / Pedido em processamento"** entre o submit e a ativação real, em vez de
  pular direto para "Pronto". Confiança alta — decorre do estado de resposta do contrato.
- **Estado "pendente" mais forte.** Enquanto pollamos, mostrar progresso ("preparando SIM",
  "reservando seu número") alinhado aos `milestone`/itens, com um teto de tempo antes de cair em
  "ainda processando, avisaremos você".
- **Caminho de conta parcial.** `partial` precisa de UX própria: ex. número ativo mas um serviço
  pendente — já conversa com o "erro terminal / conta parcial" da spec. Não tratar `partial` como
  falha total nem como sucesso total.
- **Falha terminal.** `failed`/`rejected` → mensagem de erro + retry/suporte, sem prometer ativação.
- **(hipótese)** Se o hub de eventos existir, dá para substituir o spinner de polling por push de
  estado — mas isso é especulação até confirmar o hub; o MVP deve assumir polling.

---

## Lacunas / não confirmado

- **Transições exatas** entre estados do `ProductOrderStateType` não são formalizadas no OpenAPI
  (inferidas de nomes + regras de PATCH/DELETE).
- **Registro de hub/listener** (`/hub`) **não consta** neste arquivo — não dá para afirmar como se
  assina evento só com este contrato.
- **`action`** não tem enum no schema; "add/modify/delete" é convenção TMF, valores reais vistos:
  `add`, `modify`, `suspend`.
- **IDs de productOffering reais** do catálogo DreiGo (plano/SIM/número) precisam vir do
  catálogo do ambiente; os usados aqui (`PO_PRE_SIM_CARD`, `PO_PRE_MSISDN_STD`) são dos exemplos.
- Se `relatedParty`/`productOffering` são de fato **obrigatórios** é regra de backend, não do schema
  (o schema só obriga `productOrderItem minItems:1`).
