# TMF637 Product Inventory Management — Knowledge Base

> Base de conhecimento para validar/implementar a nossa **installed base** / **Customer 360**
> (app self-care MVNO prepaid Drei/DreiGo).

## Fonte

- **Arquivo:** `contracts/dxp-reference/product-inventory-management-v4.yaml`
- **`info.title`:** TMF637 Product Inventory Management REST Interface
- **`info.version`:** **4.1**
- **`openapi`:** 3.1.0
- **server (exemplo):** `http://localhost:8087/eoc` (DXP/EOC da Ericsson)

### Aviso de completude desta leitura (importante — não é invenção)

O YAML é **um único JSON numa linha só (~110 KB)**. Com as ferramentas disponíveis nesta
sessão (sem shell; busca por regex pula a linha longa por tratá-la como binária; o leitor
de código está restrito ao workspace), **só foi possível ler com segurança os primeiros
~30.000 caracteres** do arquivo.

Isso significa:

- **Lido e verificado:** os `paths`/operações, todos os `parameters` (Range, Authorization,
  fields, searchParams, expand, history), e a parte inicial de `components.schemas` —
  incluindo o schema **`Product` completo**, `ProductPrice`, `ProductRelationship`,
  `ProductOfferingRef`, `ProductSpecificationRef`, `Characteristic`,
  `CharacteristicValueWrapper`, `Place`, `Amount`, `Price`, `BillingAccountRef`,
  `ProductOrderItem`, `ProductRef`/`ProductRefOrValue`, `ProductPriceAlteration`,
  `ProductOfferingPriceRef`.
- **NÃO alcançado nesta leitura** (ficou além do byte 30.000): o bloco
  `components.examples` — ou seja, **os exemplos reais `getProductById.json`,
  `searchByStatus.json`, `searchByRealtedParty.json`, etc.** — e os schemas do fim
  (`RelatedParty`, `ValidityDuration`, `Quantity`, `Resource`/`ResourceRef`,
  `Service`/`ServiceRef`, `RelatedEntity`, `RelatedProductPrice`, `ErrorMessage`).

**Consequência honesta:** o schema do `Product` (pergunta 1), o lifecycle/status como campo
(parte da 3), e o contrato de filtro/paginação (pergunta 5) estão respondidos com **trechos
reais**. Mas o **exemplo prepaid real** ("Mobile Silver/Bronze Prepaid Bundle Plan" —
perguntas 2 e 4, e parte da 3) **não pôde ser extraído** porque o bloco `examples` não está
no intervalo legível. Onde isso ocorre, está marcado explicitamente como
**`não confirmei (fora do alcance da leitura)`** em vez de ser preenchido por suposição.

Para fechar as lacunas: reabrir o arquivo já **pretty-printed** (uma chave por linha), ou
dividir o JSON em arquivos por `example`, torna o bloco `components.examples` legível e
pesquisável. Veja "Dívidas Fase 8".

---

## 1. Schema `Product` (TMF637 4.1) — campos reais

Descrição no contrato: *"A product offering instance procured by a customer or other
interested party playing a party role. A product is realized as one or more service(s)
and / or resource(s)."*

| Campo | Tipo (schema) | Descrição (do contrato) |
|---|---|---|
| `id` | string | Unique identifier of a product |
| `href` | string | Reference to the product |
| `status` | string | *"A product status type. Is the lifecycle status of the product."* (valores não enumerados no schema — ver §3) |
| `name` | string | Name of the product. Pode ser igual ao nome do product offering |
| `description` | string | Texto livre; pode ser copiado da descrição do Product Offering |
| `version` | string | Versão da instância do produto (string numérica) |
| `billingAccount` | `BillingAccountRef` | Estrutura da conta de faturamento |
| `isBundle` | boolean (default `false`) | `true` → ProductBundle (instância de BundledProductOffering); `false` → ProductComponent (SimpleProductOffering) |
| `isCustomerVisible` | boolean (default `false`) | Visível ao cliente |
| `productOffering` | `ProductOfferingRef` | Referência à oferta orderável (inclui pricing) |
| `startDate` | string date-time | Data em que a versão atual do produto começa |
| `validFor` | `ValidityDuration` | Janela de validade do produto *(schema `ValidityDuration` fora do alcance da leitura)* |
| `terminationDate` | string date-time | Data em que o produto termina |
| `place` | array<`Place`> | Lugar onde o produto é instalado/usado |
| `relatedParty` | array<`RelatedParty`> | Partes relacionadas (ex.: Customer) *(schema `RelatedParty` fora do alcance da leitura)* |
| `productCharacteristic` | array<`Characteristic`> | Características que caracterizam o produto |
| `productPrice` | array<`ProductPrice`> | Lista de preços do produto |
| `productRelationship` | array<`ProductRelationship`> | Lista de relacionamentos entre produtos |
| `productSerialNumber` | string | Serial (típico de produto tangível, ex.: router) |
| `productSpecification` | `ProductSpecificationRef` | Referência à product specification |
| `realizingResource` | array<`Resource`\|`ResourceRef`> | Recursos que realizam o produto *(schemas fora do alcance da leitura)* |
| `realizingService` | array<`Service`\|`ServiceRef`> | Serviços de suporte *(schemas fora do alcance da leitura)* |
| `quantity` | `Quantity` | Quantidade associada *(schema fora do alcance)* |
| `relatedEntity` | array<`RelatedEntity`> | Entidades relacionadas *(schema fora do alcance)* |
| `parentProduct` | string | Referência ao bundle pai, se existir |
| `externalId` | string | IDs externos separados por vírgula |
| `productOrderItem` | array<`ProductOrderItem`> | Order items que criaram/atualizaram o produto |
| `product` | array<`Product`\|`ProductRef`> | Produtos que compõem o bundle |
| `@baseType` / `@schemaLocation` / `@type` | string | Atributos genéricos TMF |

### Campos obrigatórios

**No schema `Product`, não há bloco `required`** — ou seja, pelo contrato, **nenhum campo de
`Product` é marcado como obrigatório** (nem `id`, nem `status`). Obrigatoriedade aparece em
sub-schemas:

- `Characteristic` → **`required: ["name","value","valueType"]`**
- `Place` → **`required: ["href","id"]`**

(Verificado diretamente no texto do contrato.)

### Sub-schemas relevantes (verificados)

**`ProductOfferingRef`** — `id` (string), `href` (string), `@referredType`, `@type`, etc.
É a referência real à oferta. (Confirma que o "tipo" do produto no real vem de uma
**referência à offering + `productSpecification` + `isBundle` + `productRelationship`**, não
de um nome/regex.)

**`ProductRelationship`** — `relationshipType` (string) + `product` (`ProductRef`).
Descrição do contrato: *"Linked products... [bundled] if the product is a bundle...;
[reliesOn] if the product needs another already owned product to rely on (e.g. an option on
an already owned mobile access product); [targets] or [isTargeted]..."* e
*"The type of relationship (e.g. depends on, enables)"*.
> Nota: o briefing menciona `relationshipType:'requires'`. O schema **descreve** exemplos
> `bundled` / `reliesOn` / `targets` / `isTargeted` / "depends on" / "enables"; o valor
> literal `requires` só apareceria no bloco `examples`, que **não foi alcançado**. Portanto
> `requires` fica como **não confirmei** até a leitura do exemplo.

**`ProductPrice`** (campos reais verificados): `id`, `billingAccount`, `description`, `name`,
`price` (`Price` → `dutyFreeAmount` → `Amount{unit,value}`), **`priceType`** (*"recurring,
discount, allowance, penalty..."*), `productOfferingPrice` (`ProductOfferingPriceRef`),
`taxCode`, `chargeTypeCode`, `externalId`, `relatedProductPrice`, `characteristic`,
**`recurringChargePeriod`** (*"Could be month, week"*), `unitOfMeasure` (*"minutes, GB..."*),
`appliedDiscount`, `amountAfterDiscount`.

**`Characteristic`**: `name` (req), `valueType` (req; *"Currently supported value is
'String'"*), `value` (req, `CharacteristicValueWrapper`), `validFor` (`ValidityDuration`).
> É aqui que os `lifecycleParameter` / `instance_state` do briefing morariam (name/value
> pairs). O **mecanismo** (name/value) está confirmado; os **nomes/valores concretos** do
> prepaid estão no `examples` → **não confirmei**.

---

## 2. Como um PLANO PREPAID real aparece no inventory

**Status: não confirmei (fora do alcance da leitura).**

O exemplo "Mobile Silver/Bronze Prepaid Bundle Plan" vive em `components.examples`
(referenciado em `getProductById.json`, `searchByStatus.json`, etc.), que está além do byte
30.000 e **não pôde ser lido** com as ferramentas desta sessão. Não vou reconstruir o JSON
do exemplo de memória nem por inferência — isso seria invenção.

O que o **schema** (lido) permite afirmar com segurança sobre a *forma* esperada:

- O plano seria um `Product` com `isBundle: true` e um array `product[]`/`productRelationship[]`
  apontando para os componentes (SIM, número, voz, dados).
- Lifecycle seria expresso via `productCharacteristic[]` (pares name/value) e/ou o campo
  `status` — **os nomes `lifecycleParameter`/`instance_state` não foram verificados.**
- Preço via `productPrice[]` com `priceType` + `recurringChargePeriod` (`month`/`week`
  confirmados como exemplos do schema; `priceType` "One-Time"/"Recurring" e o código `O`/`M`
  do briefing **não foram verificados** no texto lido).

> **Ação para completar esta seção:** ler o bloco `components.examples` (ver Dívidas Fase 8)
> e colar aqui o exemplo prepaid **reduzido**, como pedido.

---

## 3. Status / lifecycle de um produto

- **Campo `status`** existe em `Product`, tipo `string`, descrito como
  *"A product status type. Is the lifecycle status of the product."*
- **O schema NÃO enumera os valores** (`status` é string livre, sem `enum`). Logo, a lista
  canônica `Active` / `Pending` / etc. **não está no schema** — ela apareceria apenas nos
  **exemplos**, que **não foram alcançados**.
- `searchParams` (verificado) lista `status` como parâmetro de busca suportado e há um
  exemplo nomeado *"Search for Product by status"* — confirmando que **filtrar por status é
  suportado**, mas sem revelar os valores.

**Valores concretos de `status`: não confirmei.** (TMF padrão costuma usar `Created`,
`PendingActive`, `Active`, `Suspended`, `PendingTerminate`, `Terminated`/`Aborted` — isto é
**conhecimento geral TMF, não o contrato**; tratar como hipótese até ler os exemplos.)

---

## 4. Como o SIM e o NÚMERO aparecem

**Status: parcialmente confirmado pelo schema; detalhe concreto não confirmado.**

Do schema (verificado), o modelo oferece três mecanismos para SIM/número:

1. **Produtos separados relacionados** — via `productRelationship[]`
   (`relationshipType` + `ProductRef`) e/ou `product[]` dentro do bundle. Coerente com modelar
   SIM/número como `Product` próprios ligados ao plano.
2. **`realizingResource[]`** (`Resource`/`ResourceRef`) — recursos que *realizam* o produto.
   SIM (como recurso físico/eSIM) e número (como recurso de numeração) são candidatos naturais
   aqui. **Os schemas `Resource`/`ResourceRef` ficaram fora do alcance da leitura**, então os
   campos exatos **não foram verificados**.
3. **`realizingService[]`** — serviços de suporte (voz/dados como CFS/RFS).

A operação `GET /product/{productId}` e a lista aceitam `expand=realizingService,realizingResource`
(**verificado** nos parameters) e há exemplo *"...with expanded view of realizingService and
realizingResource"* — confirmando que **recursos/serviços realizadores são um conceito de
primeira classe** no inventory.

**Como o SIM/número aparecem concretamente no exemplo prepaid (produto separado? recurso?
qual `relationshipType`?): não confirmei** (bloco `examples` fora do alcance).

---

## 5. Filtrar por customer e paginação

**Ambos confirmados diretamente nos `parameters` do contrato.**

### Filtro por customer

- `GET /productInventory/v4/product?searchParams=...`
- `searchParams` suportados incluem (texto literal do contrato): `id, name, description,
  isCustomerVisible, productSpecification.id, status, isBundle, externalId,
  productSerialNumber, billingAccount.id, parentProduct, validFor.start,
  (relatedParty.id, relatedParty.role), (place.id & place.role),
  (relatedEntity.id & relatedEntity.role)`.
- Ou seja, **filtra-se por cliente com o par `relatedParty.id` + `relatedParty.role`**
  (ex.: `relatedParty.role=Customer`). Há exemplo nomeado *"Search for Product by
  relatedParty.id & relatedParty.role"*.
  > O valor exato do role (`Customer`) viria do schema `RelatedParty`/exemplo, **fora do
  > alcance** — mas o **mecanismo** (`relatedParty.id` + `relatedParty.role`) está confirmado.

### Paginação

- **Header `Range`** (verificado): *"Returns subset of the resultset based on the items
  range"*, exemplo **`items=1-2`**. Há exemplo *"Get all products with pagination"*.
- `416 Requested Range Not Satisfiable` é uma resposta mapeada.

### Outros parâmetros verificados

- `fields` (data filtering, ex.: `fields=status`), `expand`
  (`realizingService,realizingResource`), `history` (`true`/`false`, default `false`),
  `Authorization` (Bearer JWT).
- `GET /product/{productId}` com `productId` no path (exemplo `68522`).

---

## 6. Divergências — nosso `Product` ↔ TMF637 real

### Tabela — nosso `Product` ↔ TMF637 `Product`

| Nosso campo (order-mock) | TMF637 `Product` | Avaliação |
|---|---|---|
| `productId` | `id` | OK (1:1) |
| `offerId` | `productOffering.id` (`ProductOfferingRef`) | OK conceitualmente, mas ver "kind" abaixo |
| `name` | `name` | OK |
| `kind: 'plan'\|'add-on'\|'sim'` | **não existe** — derivado de `isBundle` + `productSpecification` + `productRelationship`/`realizingResource` | **Divergência** (ver nota) |
| `status: 'active'\|'pending'` | `status` (string livre, sem enum no schema) | Simplificação; casing/valores reais não confirmados |
| — | `isBundle` | **Perdemos** |
| — | `productRelationship[]` (bundled/reliesOn/...) | **Perdemos** |
| — | `productCharacteristic[]` (lifecycle via name/value) | **Perdemos** |
| — | `productPrice[]` (`priceType`, `recurringChargePeriod`) | **Perdemos** |
| — | `validFor` / `startDate` / `terminationDate` | **Perdemos** |
| — | `realizingResource[]` / `realizingService[]` | **Perdemos** (relevante p/ SIM/número) |
| — | `relatedParty[]` (role=Customer) | Implícito no nosso `getInstalledBase(customerId)` |

### O que o nosso modelo captura — e o que perde

**Captura o essencial para o MVP:** identidade (`id`), oferta (`offerId`↔`productOffering.id`),
nome, e um estado binário suficiente para o Customer 360 ordenar e exibir.

**Perde (com impacto):**

- **`isBundle` + `productRelationship`**: no real, um plano prepaid é um **bundle** com
  componentes relacionados. Nosso modelo achatado (lista de `Product` irmãos com `kind`) não
  representa a hierarquia bundle→componentes nem o relacionamento plano↔SIM↔número↔voz.
- **`productCharacteristic` de lifecycle**: estados mais ricos (ex.: `instance_state`) que o
  binário `active/pending` não cabem.
- **`validFor` / datas**: sem janela de validade/terminação.
- **`productPrice`**: sem preço/periodicidade no inventory.

### `kind` por regex no `offerId` — frágil (registrado)

**Confirmado pelo contrato que a nossa derivação de `kind` via regex no `offerId` é frágil.**
No real, o "tipo" de um produto é dado por **dados estruturados**:
`productOffering` (ref), `productSpecification` (ref + version), **`isBundle`** (bundle vs
componente) e **`productRelationship`** (papel do componente no bundle). Derivar
plan/add-on/sim de um padrão textual no identificador da oferta:

- quebra se a convenção de nomes de offering mudar;
- não distingue bundle de componente;
- não expressa o papel relacional (um SIM é um componente *reliesOn*/*bundled* do plano, não
  um irmão solto).

**Recomendação:** quando houver fonte real, derivar o tipo de `isBundle` +
`productSpecification`/`productOffering` + `productRelationship`, e tratar `kind` como um
rótulo de UI derivado, não como verdade de domínio.

### SIM como produto separado com offerId `"<tenant>-sim-po"` — validação

**Direção validada pelo schema; convenção do `offerId` não é ditada pelo contrato.**

- O TMF637 **suporta** modelar o SIM como um `Product` próprio relacionado ao plano — via
  `productRelationship` / `product[]` (bundle) e/ou como `realizingResource`. Então **a
  decisão de modelar o SIM como produto separado é compatível com o modelo real**.
- Se o SIM é melhor modelado como **produto relacionado** (`productRelationship`) ou como
  **recurso realizador** (`realizingResource`) depende do exemplo prepaid real —
  **não confirmei** qual dos dois o exemplo usa.
- O literal `"<tenant>-sim-po"` é **nossa convenção de `offerId`** (mapearia para
  `productOffering.id`); o contrato não prescreve formato de id de offering, então é uma
  escolha nossa válida, desde que exista a offering correspondente no catálogo.

---

## O que o exemplo prepaid real nos ensina

**Não confirmei.** O exemplo prepaid ("Mobile Silver/Bronze Prepaid Bundle Plan") está no
bloco `components.examples` do YAML, que não pôde ser lido nesta sessão (além do byte 30.000;
busca por regex pula a linha única de ~110 KB). Esta seção deve ser preenchida **colando o
exemplo real reduzido** depois de reabrir o arquivo pretty-printed — e não antes, para não
inventar `relationshipType`, `priceType`, `recurringChargePeriod` ou nomes de
`productCharacteristic` que não foram verificados.

---

## Dívidas Fase 8

1. **Ler o bloco `components.examples`** (bloqueador das §2, §4, parte da §3 e da seção
   "o que o exemplo nos ensina"). O arquivo é JSON numa linha só; a busca por regex o trata
   como binário e o leitor para em ~30 KB. Reabrir **pretty-printed** (uma chave por linha)
   ou **dividir por example em arquivos `.json`** torna-o legível e pesquisável. Extrair daí:
   valores reais de `status`; `relationshipType` do SIM/número/voz/dados; `priceType` e
   `recurringChargePeriod` do prepaid; nomes dos `productCharacteristic` de lifecycle
   (`instance_state`/`lifecycleParameter`); se SIM/número são `productRelationship` ou
   `realizingResource`.
2. **Enriquecer o nosso `Product`** para carregar (ou derivar e preservar): `isBundle`,
   `productRelationship`, `validFor`/datas, e um `status` alinhado aos valores reais do EOC.
3. **Substituir o `kind` por regex** por derivação a partir de `isBundle` +
   `productOffering`/`productSpecification` + `productRelationship`.
4. **Modelar explicitamente o relacionamento plano↔SIM↔número** no Customer 360
   (bundle/componentes), em vez de lista achatada de irmãos.
5. **Confirmar o role de customer** (`relatedParty.role`) e integrar `Range: items=a-b`
   para paginação ao chamar o inventory real.
6. **Ler os schemas do fim** (`RelatedParty`, `ValidityDuration`, `Quantity`, `Resource`,
   `Service`, `RelatedEntity`) para fechar a tabela de campos.
