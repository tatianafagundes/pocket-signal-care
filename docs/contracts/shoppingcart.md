# Knowledge Base — DXP Shopping Cart (TMF663) ↔ nosso order seam

> **Fonte:** `contracts/dxp-reference/shopping-cart-v1.yaml`
> `info.title`: **TMF663 Shopping Cart REST Interface** · `info.version`: **"1.0"** · `openapi: 3.0.1`
> API root (dos exemplos `href`): **`/cpq/shoppingCart/v1`**
> Lido por seções (grep não alcança o arquivo: ele está fora do workspace root, então foi leitura paginada). Trechos abaixo são reais, reduzidos. Onde não consegui confirmar algo no arquivo, está dito explicitamente — nada foi inventado.

---

## 0. TL;DR para a Fase 8

- O fluxo real **não é** "criar + add + submit". É **criar → adicionar itens (via PATCH) → `/price` → `setState(present)` → `setState(accept)` → `/submit`**. `price` e a apresentação/aceite existem como passos separados do submit — a suspeita do pedido se confirma.
- **Adicionar item** no contrato real é majoritariamente **`PATCH /shoppingCart/{id}`** com JSON-Patch (`op:add, path:/cartItem/-`), **não** um `POST .../cartItem`. Existe `GET /shoppingcart/{cartId}/cartItem` (busca) e `GET .../cartItem/{id}` — **não localizei POST/DELETE em `/cartItem`** nas seções lidas (ver §2 e §9).
- **`/submit`** gera uma ordem no **Order Management** (TMF622 / "Order Manager REST Interface 1.9"), devolve `orderId` e `externalOrderID`, e muda status para **`CLOSED.SUBMITTED`**.
- Para o **mock da demo**, `createCart → addItem → submitOrder` é aceitável. Para o **`order-http.ts` real**, é simplista demais: faltam `price` e a transição de estado. Ver §6 (dívidas Fase 8).

---

## 1. Sequência REAL de um cart no DXP

Operações confirmadas no arquivo (path + método + `operationId` + status resultante):

| Passo | Endpoint | Método | operationId | Efeito no `status` |
|---|---|---|---|---|
| Criar | `/shoppingCart` | POST | *(não confirmado o id)* | `OPEN.DRAFT` |
| Ler | `/shoppingCart/{id}` | GET | — | — |
| Adicionar/alterar item | `/shoppingCart/{id}` | PATCH | `patchShoppingCart` | permanece `OPEN.DRAFT` |
| Precificar | `/shoppingCart/{id}/price` | POST | `priceShoppingCart` | preenche preços; não muda estado |
| Apresentar | `/shoppingCart/{id}/setState` (`state: present`) | POST | `setShoppingCartState` | `OPEN.PRESENTED` |
| Aceitar | `/shoppingCart/{id}/setState` (`state: accept`) | POST | `setShoppingCartState` | `OPEN.ACCEPTED` |
| Cancelar | `/shoppingCart/{id}/setState` (`state: cancel`) | POST | `setShoppingCartState` | fecha (CLOSED.ABORTED, ver §4) |
| Submeter | `/shoppingCart/{id}/submit` | POST | `submitShoppingCart` | `CLOSED.SUBMITTED` |

**O que é obrigatório antes do submit?** O contrato **não declara um gate formal** "price/validate obrigatórios" num campo `required`. Mas a semântica está escrita nas descrições:

- `setState` → `present` (trecho real):
  > "This operation is used to present the contents of a Shopping Cart to the user **after validation and pricing**. … the state of the Shopping Cart is changed to OPEN.PRESENTED."

  Ou seja, o fluxo projetado assume **pricing (e validação) antes de apresentar**, e apresentar/aceitar antes de submeter.

- `info.description` lista as task operations do recurso: **"validate, present, accept, price, and cancel"**. Então *validate* é uma operação de negócio reconhecida pela API.

**O que `/price` retorna?** A própria `ShoppingCart`, agora com:
- `cartItem[].itemPrice[]` — preço por item, com `priceType` (`ONETIME` / `RECURRING` / `ALLOWANCE`), `recurringChargePeriod` (ex.: `Monthly`), `price.dutyFreeAmount{unit,value}` (ex.: `EUR` / `15`), `productOfferingPrice.id`, e `upfrontPayment` (ex.: `notRequired`).
- `cartTotalPrice[]` — total do cart (a descrição do price diz "Get cart total price information"; um exemplo agrupa o total por `upfrontPayment` para encargos onetime).

Trecho real (resposta de `/price`):
```yaml
cartItem:
- action: ADD
  product: { name: Postpaid Mobile Data 3GB, productSpecification: { id: PS_B2B_DATA_PostP } }
  itemPrice:
  - name: POP Recurring
    priceType: RECURRING
    recurringChargePeriod: Monthly
    price: { dutyFreeAmount: { unit: EUR, value: 15 } }
    productOfferingPrice: { id: CT_B2B_RECURRING }
  - name: POP Allowance Data
    priceType: ALLOWANCE
    price: { dutyFreeAmount: { value: 0 } }
    characteristic:
    - { name: allowanceUnitValue, value: "3" }
    - { name: allowanceUnitType,  value: GB }
```

**O que `/validate` retorna?** **Não localizei o bloco de path `/shoppingCart/{id}/validate` nas seções lidas.** O arquivo é grande e foi lido por amostragem; `validate` aparece citado em `info.description` como task operation, e os erros de validação têm schema próprio (`CartItemError.reason` inclui `"VALIDATION 400"`, `"ELIGIBILITY 400"`, `"AVAILABILITY 400"`) — ver §2. Tratar como **"existe conceitualmente, path não confirmado"**; confirmar no arquivo antes de implementar a chamada real.

### Diagrama do fluxo real (texto)

```
POST /shoppingCart                      -> cart {id}, status OPEN.DRAFT
          |
PATCH /shoppingCart/{id}  (op:add /cartItem/-  value:{action:ADD, productOffering:{id}})
          |   (repetir por item: plano, SIM/MSISDN, device…)
          v
POST /shoppingCart/{id}/price           -> cart com itemPrice[] + cartTotalPrice[]   (sem mudar estado)
          |
   [validate]  <- citado em info (validate/present/accept/price/cancel); path não confirmado
          |
POST /shoppingCart/{id}/setState {state:present}  -> OPEN.PRESENTED  (quoteID, quoteExpirationDate)
          |
POST /shoppingCart/{id}/setState {state:accept}   -> OPEN.ACCEPTED
          |
POST /shoppingCart/{id}/submit          -> CLOSED.SUBMITTED  (orderId + externalOrderID)
                                             => ordem no Order Management (TMF622)

Saída alternativa a qualquer momento:
POST /shoppingCart/{id}/setState {state:cancel}   -> cart fechado (CLOSED.ABORTED.*)
```

> Nota de honestidade: a cadeia `price → present → accept → submit` é o que as **descrições** das operações desenham. O contrato não força programaticamente a ordem (os request bodies de `price`/`submit` são `{}`), mas um backend real recusa submit de um cart em estado incompatível (respostas `409 Conflict` estão definidas em todas as task ops).

---

## 2. Schema de `CartItem` — o que um item exige

Campos reais de `#/components/schemas/CartItem` (reduzido):

```yaml
CartItem:
  properties:
    action:            # "ADD" / "MODIFY" / "NO_CHANGE" / "DELETE"
      type: string
    id:                # id do item dentro do cart
    status:            # ex.: "Active", "SavedForLater" (nos exemplos aparece "NEW")
    productOffering:   # $ref ProductOfferingRef  -> { id, href, name, @referredType }
    product:           # $ref Entity (produto configurado: characteristics, realizingResource…)
    service:           # $ref ServiceEntity (para Service Shopping Cart)
    serviceSpecification:
    itemPrice:         # array CartItemPrice (preenchido por /price)
    quantity:          # $ref Quantity
    relatedParty:      # array RelatedParty
    relatedEntity:     # array RelatedEntity (ex.: role BillingAccount, Contract, SWAPOUT, Product)
    attrs:             # array Attribute (name/value)
    place:             # array InteractionLocation (ex.: role serviceLocation)
    contextCharacteristic / contextSpecification / contextScope
    note:
```

**Mínimo para adicionar** (visto em dezenas de exemplos de PATCH): `action: ADD` + `productOffering.id`. Tudo o mais é opcional/condicional. Exemplo real de item inválido = `productOffering: {}` (sem id) → erro.

Observações relevantes:
- **`quantity`** existe no schema (`$ref Quantity`), mas **nenhum exemplo** de add usa quantity — o padrão é 1 PO = 1 cartItem. (Não há `quantity: 2` nos exemplos lidos.)
- **Características** de um item vão em `product.productCharacteristic[] {name,value}` (ex.: `resourceNumber` para MSISDN) ou, para serviços, `service.serviceCharacteristic[]`.
- **Billing account** por item: `relatedEntity: [{role: BillingAccount, id: ...}]`.

### Como adicionar um **plano** vs um **SIM/MSISDN**

É a **mesma mecânica** — muda só o `productOffering.id`. Exemplos reais (todos via `PATCH /shoppingCart/{id}`):

Plano (prepaid bundle):
```yaml
- op: add
  path: /cartItem/-
  value:
    action: ADD
    productOffering: { id: BPO_B2C_MB_PREP_TP_PPMAX }   # bundle de plano prepaid
```

SIM:
```yaml
- op: add
  path: /cartItem/-
  value:
    action: ADD
    productOffering: { id: PO_DXP_SIM }                 # (variantes: PO_DXP_MSISDN)
```

MSISDN com característica (número escolhido):
```yaml
- op: add
  path: /cartItem/-
  value:
    action: ADD
    productOffering: { id: PO_DXP_MOBILE_MSISDN_SILVER }
    product:
      productCharacteristic:
      - { name: resourceNumber, value: "1232131234" }
```

> No modelo de dados do DXP, "SIM" e "MSISDN" são **Product Offerings** do catálogo (ex.: `PO_DXP_SIM`, `PO_DXP_MSISDN`, `PO_DXP_MOBILE_MSISDN_SILVER`). Isso casa com a decisão da nossa spec de tratar o SIM como um PO (`"<tenant>-sim-po"`) e não como oferta comercial. Diferença: no real o id do PO vem do catálogo (ECM), não é um literal fixo.

### Erros de item (para a UI de validate/price)
`CartItemError.reason` (trecho real) categoriza: `"MISSINGINPUT 400"`, `"INVALIDINPUT 400"`, `"NOTFOUND 404"`, `"EXCEEDCARDINALITY 400"`, `"UNRESOLVEDRELATION 201"`, `"VALIDATION 400"`, `"ELIGIBILITY 400"`, `"AVAILABILITY 400"`. `severity`: `WARNING` ou `ERROR`. Agregados em `CartItemErrorList` / (batch) `BatchCartItemErrorList`.

---

## 3. O que o `/submit` gera e como se liga ao Product Ordering

Descrição real de `submitShoppingCart` (reduzida):
> "This operation is used to submit the Shopping Cart to the **Order Management** component to handle the order. … fields mapped according to **Order Manager Order Management REST Interface 1.9**. The order is created and run using the **Order Spec ItemByItem**. The order is created **by value**. … status code 200 … state changed to **CLOSED.SUBMITTED**. The response includes **orderId** and **externalOrderID** which can be used to track the order in order management system."

- Request body: `{}` (POST vazio). Opcional `?validatePersonalizationFile=true`.
- Resposta: a `ShoppingCart` com `status: CLOSED.SUBMITTED`, `orderId`, `submittedDate` (e, por schema, `externalOrderID`).

Trecho real da resposta de submit:
```yaml
status: CLOSED.SUBMITTED
orderId: "10000020101039"
submittedDate: 2019-11-21T13:52:26.264Z
quoteID: 19325-2029-10000164-64150136
owner: "305064"
```

Ligação com **Product Ordering Management**: o submit cria um **ProductOrder** no Order Manager (há um contrato irmão na pasta: `product-ordering-management-v5.yaml`, TMF622). O `orderId` (interno) e o `externalOrderID` são as chaves para acompanhar esse ProductOrder. Campos de amarração no schema `ShoppingCart`:
- `orderId` — "Internal order identifier when the order is established and submitted to Order Manager".
- `externalOrderID` — "Resulting external Order Id when the order is submitted to Order Manager".
- `orderSpecification` (`$ref OrderSpecification`) — a spec usada (ex.: ItemByItem).

> Não cruzei este arquivo com `product-ordering-management-v5.yaml`; a ligação acima é a que o próprio contrato de cart declara.

---

## 4. Estados do cart (`setState` e valores de `status`)

`status` sempre começa com `OPEN` ou `CLOSED` (regra declarada no schema). Valores reais vistos em exemplos e no enum de busca do `/batchShoppingCart`:

| status | Quando | Como se chega |
|---|---|---|
| `OPEN.DRAFT` | recém-criado / em edição (add/price não mudam disso) | POST create, PATCH, price |
| `OPEN.PRESENTED` | apresentado ao usuário após validação e pricing | `setState {state: present}` |
| `OPEN.ACCEPTED` | aceito pelo usuário | `setState {state: accept}` |
| `CLOSED.SUBMITTED` | submetido ao Order Management | `/submit` |
| `CLOSED.ABORTED.ABORTED_BY_CLIENT` | cancelado pelo cliente | `setState {state: cancel}` (inferência: cancel → aborted) |
| `CLOSED.ABORTED.ABORTED_BY_SERVER` | abortado pelo servidor | — |

`setState` body real:
```yaml
# present
{ state: present, quoteExpirationDate: 2019-10-19T16:44:55.546Z }
# accept
{ state: accept }
# cancel
{ state: cancel, note: [{ author: apiUser, text: "This sc is not need anymore" }] }
```
`present` devolve `quoteID` + `quoteOn` + `quoteExpirationDate` (o cart vira uma **cotação** apresentável). Modificação é bloqueada quando o cart está `CLOSED` (regra do PATCH).

> Mapa `cancel → CLOSED.ABORTED.ABORTED_BY_CLIENT` é inferência a partir dos valores de busca; a resposta de exemplo do cancel não mostra o `status` final. Confirmar se for implementar cancelamento.

---

## 5. Como tenant / customer entram

- **`X-Tenant-Id`** — header, "used only when multi-tenancy mode is enabled". Ex.: `TEN100000100000`. Presente em GET/POST/PATCH. Há também um campo `tenant` no corpo (`ShoppingCart.tenant`), **mas** a doc diz que o valor do header/JWT **sobrescreve** o do corpo ("overridden by the tenant value present in the header or token"). Em multitenancy, carts são filtrados automaticamente por tenant.
- **Customer** — via `relatedParty: [{ role: customer, id: "<customerId>" }]` (no cart e/ou por item). Role aparece como `customer` e às vezes `Customer`. Há ainda `ShoppingCart.owner` (customer id ou id externo) e, nas respostas, `relatedParty[].characteristic` (ex.: `customerSegment: residential|VIP`).
- **Billing account** — `relatedEntity: [{ role: BillingAccount, id: "<baId>" }]` (no cart ou no item).
- **Anônimo** — dá para criar cart sem `relatedParty` (exemplo "Create Anonymous …"), usando `contextSpecification.id` (ex.: `resiCatalogContext`).

Exemplo real de criação com customer + billing:
```yaml
relatedParty:
- { role: customer, id: 1000 }
relatedEntity:
- { role: BillingAccount, id: billingAccountId }
```

---

## 6. DIVERGÊNCIAS CRÍTICAS — nosso modelo vs. real

### Nosso order seam hoje (do spec/`order-mock`)
`OrderConnector` = `createCart(customerId)` → `addItem({cartId, offerId})` → `submitOrder(cartId)` (+ `getInstalledBase`). Onboarding (Fase 5) monta `createCart → addItem(plano) → addItem("<tenant>-sim-po") → submitOrder`.

### O que falta vs. TMF663
1. **`addItem` ≠ um POST dedicado.** No real, adicionar item é **`PATCH /shoppingCart/{id}`** com JSON-Patch (`op:add, path:/cartItem/-, value:{action:ADD, productOffering:{id}}`). O `offerId` do nosso seam mapeia para `productOffering.id`. (Existe `GET /cartItem` para busca; **POST em `/cartItem` não foi confirmado** — ver §9.)
2. **Falta `/price`.** O real tem um passo explícito que calcula `itemPrice[]` + `cartTotalPrice[]`. Nosso seam não tem `price`; o total nunca é calculado pelo backend.
3. **Falta a transição de estado (`setState present/accept`).** No real, o submit pressupõe um cart apresentado/aceito. Nosso `submitOrder` pula isso.
4. **`submitOrder` devolve menos.** O real devolve `orderId` **e** `externalOrderID` + `status: CLOSED.SUBMITTED`. Garantir que o `order-http.ts` capture ambos (hoje o mock provavelmente só tem um `order.status`).

### A nossa orquestração do submit é realista?
**Para o mock: sim, suficiente.** `createCart → addItem×2 → submitOrder` preserva a história e é testável. Manter.

**Para o `order-http.ts` real: simplista demais.** O que o adaptador HTTP real vai precisar fazer, por função do seam:

| nosso seam | chamada(s) real(is) TMF663 |
|---|---|
| `createCart(customerId)` | `POST /shoppingCart` com `relatedParty:[{role:customer, id:customerId}]` (+ `X-Tenant-Id`) |
| `addItem({cartId, offerId})` | `PATCH /shoppingCart/{cartId}` `[{op:add, path:/cartItem/-, value:{action:ADD, productOffering:{id:offerId}}}]` |
| *(novo)* `priceCart(cartId)` | `POST /shoppingCart/{cartId}/price` → ler `cartTotalPrice[]`/`itemPrice[]` |
| *(novo)* `present/accept` | `POST /shoppingCart/{cartId}/setState {state:present}` depois `{state:accept}` |
| `submitOrder(cartId)` | `POST /shoppingCart/{cartId}/submit` → `orderId` + `externalOrderID`, `status CLOSED.SUBMITTED` |
| `getInstalledBase(customerId)` | **não** é Shopping Cart; é outro contrato (product-inventory). Fora de escopo aqui. |

### Precisamos de um passo "price/validate" na UI?
**Sim, para fidelidade ao produto real — e é um bom momento de UX.** O `/price` existe justamente para **mostrar o total calculado pelo backend antes de confirmar** (recurring + onetime + allowance, com `upfrontPayment`). Recomendação:
- **Mock/demo agora:** a UI pode exibir o preço da oferta do catálogo (não precisa chamar price). `createCart → addItem → submitOrder` continua valendo. **Mas** registrar que esse total é "do catálogo", não "do cart precificado".
- **Real depois:** inserir um `priceCart` entre montar o cart e confirmar, e renderizar o `cartTotalPrice` de volta ("Total: € X/30 dias · renova") a partir da resposta do backend — não de um cálculo local. A revisão da spec já apontou o risco de "saldo/total exibido que não reflete o backend"; o `/price` é a fonte correta desse número.
- **validate:** se/quando o path for confirmado, usá-lo para bloquear o avanço quando houver `CartItemError` com `severity: ERROR` (ex.: `ELIGIBILITY`, `AVAILABILITY`) e mostrar `WARNING`s sem bloquear.

---

## 7. Exemplos reais reduzidos (colar/adaptar)

Criar cart (prepaid, 1 customer):
```yaml
POST /cpq/shoppingCart/v1/shoppingCart
X-Tenant-Id: TEN100000100000
{ "relatedParty": [ { "role": "customer", "id": "1000" } ] }
# -> 201 { id, status: "OPEN.DRAFT", "@type": "ProductShoppingCart" }
```

Adicionar plano + SIM (dois PATCH, ou um PATCH com dois ops):
```yaml
PATCH /cpq/shoppingCart/v1/shoppingCart/{id}
Content-Type: application/json-patch+json
[
  { "op":"add", "path":"/cartItem/-", "value": { "action":"ADD", "productOffering": { "id":"BPO_B2C_MB_PREP_TP_PPMAX" } } },
  { "op":"add", "path":"/cartItem/-", "value": { "action":"ADD", "productOffering": { "id":"PO_DXP_SIM" } } }
]
```

Precificar:
```yaml
POST /cpq/shoppingCart/v1/shoppingCart/{id}/price
{}
# -> 200 ShoppingCart com cartItem[].itemPrice[] e cartTotalPrice[]
```

Submeter:
```yaml
POST /cpq/shoppingCart/v1/shoppingCart/{id}/submit
{}
# -> 200 { status: "CLOSED.SUBMITTED", orderId: "...", externalOrderID: "...", submittedDate: "..." }
```

---

## 8. Observações de prepaid (relevantes para Drei/DreiGo MVNO prepaid)

Os exemplos do contrato têm bastante prepaid real — úteis como referência de ids/padrões:
- Bundles de plano prepaid: `BPO_B2C_MB_PREP_TP_PPMAX`, `BPO_B2C_MB_PREP_TP_GB`, `BPO_PREPAID_DATA`.
- Ofertas de dados prepaid: `PO_DATA_PREP_1GB`, `PO_PREPAID_DATA_1D`.
- Acesso/plano de rede: produto com `productSpecification: PS_B2C_MB_PREP_ACCESS_ALL`, `productType: allowance`, `productSubType: data`.
- SIM/MSISDN como PO: `PO_DXP_SIM`, `PO_DXP_MSISDN`, `PO_DXP_MOBILE_MSISDN_SILVER`.

Isso confirma que "plano prepaid + SIM" se modela como cartItems de PO — exatamente o shape do nosso onboarding.

---

## 9. Dívidas Fase 8 (o que ainda precisa ser confirmado/feito)

- [ ] **Confirmar o path `POST /shoppingCart` (create)** e seu `operationId`/exemplo de request — lido o `/batchShoppingCart` POST em detalhe, mas o bloco do `POST /shoppingCart` simples não foi isolado na leitura por amostragem. (O schema e o fluxo estão claros; falta o trecho exato.)
- [ ] **Confirmar se existe `POST`/`DELETE` em `/shoppingcart/{cartId}/cartItem`.** Só localizei `GET` (search) e `GET /cartItem/{id}`. Se o POST não existir, `addItem` real **tem que** ser PATCH (já é o caminho recomendado). O pedido mencionava um POST em `/cartItem` — **não confirmei** no arquivo.
- [ ] **Localizar o path `/shoppingCart/{id}/validate`.** Citado em `info.description` ("validate, present, accept, price, and cancel") e sustentado pelos `CartItemError.reason` de validação, mas o **bloco do path não foi encontrado** nas seções lidas. Confirmar antes de codar a chamada.
- [ ] **Decidir no `order-http.ts` real a inclusão de `price` + `setState(present/accept)`** antes do `submit`, e capturar `orderId` **e** `externalOrderID`.
- [ ] **Mapear `offerId → productOffering.id` real** (vem do catálogo ECM; hoje usamos literais como `"<tenant>-sim-po"`).
- [ ] **Cruzar com `product-ordering-management-v5.yaml` (TMF622)** para o que `orderId`/`externalOrderID` resolvem no Order Manager.
- [ ] **Confirmar o mapa `cancel → CLOSED.ABORTED.*`** (inferido dos enums de busca).
- [ ] **Multitenancy:** sempre enviar `X-Tenant-Id`; não confiar no campo `tenant` do corpo (é sobrescrito pelo header/JWT).

---

### Nota de método
Arquivo lido por paginação (ripgrep/file-search do workspace não alcançam `contracts/` porque o projeto está fora do root indexado nesta sessão). As seções citadas foram abertas diretamente; onde um bloco não foi aberto, está marcado como "não confirmado" em vez de afirmado.
