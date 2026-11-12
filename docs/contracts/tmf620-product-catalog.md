# TMF620 Product Catalog Management — Knowledge Base (Ericsson DXP/ECM)

> Base de conhecimento para o time implementar o seam de catálogo de verdade na **Fase 8**
> (`catalog-http.ts`) e para **validar o nosso mock agora**. Tudo aqui foi lido do contrato real;
> nomes de campos, enums e exemplos são do YAML. Onde algo **não existe** no contrato, está dito
> explicitamente. Nada foi inventado.

## Fonte

- **Arquivo:** `contracts/dxp-reference/product-catalog-management-v4.yaml`
- **`info.title`:** "Swagger File For Product Catalog Management"
- **`info.version`:** **`4.4`**
- **`openapi`:** `3.0.1`
- **Base path observado nos exemplos:** `/pcm/productCatalogManagement/v4`
- **Compliance declarado no `info.description`:** "TM Forum 620 compliant Product Catalog Management REST API".

> **Nota de verificação (fato vs. inferência).** O arquivo é grande (~776 KB). Foi lido por seções:
> os blocos de exemplo das paths (`/productOffering`, `/productOfferingPrice`, `/category`, `/listener`)
> e as definições de schema `ECM_ProductOfferingV4`, `ProductOfferingPrice (TMF)`, `ProductSpecificationV4`,
> `ProductCategoryV4`, `Quantity`, além dos parâmetros das operações GET/POST/PATCH/DELETE.
> O schema `TMFMoney` em si **não foi lido linha a linha**; sua forma (`unit` + `value`) está **confirmada
> por múltiplos exemplos reais de payload** do próprio contrato (ver §2). Onde um campo aparece só em
> exemplo e não na definição de schema que li, isso está sinalizado.

> **ECM vs. TMF (importante).** Quase toda operação aceita/retorna `anyOf: [ ECM_*V4, TMF*V4 ]` e tem um
> parâmetro de query `clientType` com dois valores: `TMF` (só os elementos da spec TMF original, **default**
> quando não informado) e `Extended` (TMF enriquecido com features ECM). Os schemas `ECM_*` têm **muito**
> mais campos (rules, translations, associations, domains, businessDate…). Para o nosso seam, o relevante
> é o subconjunto TMF; os campos ECM são ruído que devemos ignorar no mapper.

---

## 1. ProductOffering — modelo, obrigatório vs. opcional, bundle

### Campos (schema `ECM_ProductOfferingV4`, subconjunto TMF relevante)

Campos herdados do "catalog item" comum (também em Category, ProductSpecification, POP):

| Campo | Tipo | Observação do contrato |
|---|---|---|
| `id` | string | "The unique identifier of this element." |
| `name` | string | "The name of this element. **Note: This field is mandatory when using POST operation.**" |
| `href` | string (uri) | "always read only" |
| `validFor` | `TimePeriod` | `{ startDateTime, endDateTime }` (ver §3) |
| `lifecycleStatus` | enum | `In Design` · `Active` · `In Study` · `In Test` · `Launched` · `Retired` |
| `description` | string | — |
| `version` | string | "always read only" |
| `lastUpdate` | string (date-time) | "always read only" |

Campos específicos de ProductOffering:

| Campo | Tipo | Observação do contrato |
|---|---|---|
| `isBundle` | boolean | "Indicates if the Product Offering represents a single product or a bundle." |
| `isSellable` | boolean | "A flag indicating if this product offer can be sold stand-alone… If this flag is false it indicates that the offer can only be sold within a bundle." |
| `statusReason` | string | complemento ao `lifecycleStatus` |
| `productSpecification` | `ECM_ProductSpecificationRefV4` | ref para a PS (1:1) |
| `bundledProductOffering` | array `ECM_BundledProductOfferingV4` | "A Product Offering that belongs to a grouping of ProductOfferings." |
| `category` | array `CategoryRef` | "used to group product offerings in logical containers" |
| `prodSpecCharValueUse` | array `ECM_ProductSpecificationCharacteristicValueUseV4` | overrides de characteristics da PS no nível do PO (ver §4) |
| `productOfferingPrice` | array `ProductOfferingPriceRefExpandedV4` | preços do offering (ver §2) |
| `productOfferingChar` | array `ProductOfferingCharacteristic` | "Characteristics which are defined under PO level (i.e.: they do not exist on PS)" |
| `salesCategory` | array string | "possible values are Rental, Sale, Service" |
| `marketSegmentRule` | array string | "on which segment this product offering is applicable to" |
| `family` / `specificationType` / `specificationSubtype` | string | agrupamento/tipagem |

### Obrigatório vs. opcional

- **O schema `ECM_ProductOfferingV4` não declara `required:`.** Todos os campos são tecnicamente opcionais na definição.
- A **única obrigatoriedade explícita** no contrato é textual, na descrição de `name`: **"mandatory when using POST operation"**. Mesma nota aparece em Category e ProductSpecification.
- Na prática (pelos exemplos de criação), o mínimo útil de um PO é `id`/`name` + `lifecycleStatus` + `productSpecification` + `isBundle`.

> **Conclusão para leitura (listOffers).** Do lado de quem consome o catálogo, trate como garantidos apenas
> `id`, `name`, `href`, `lifecycleStatus`. Todo o resto (`productOfferingPrice`, `category`,
> `prodSpecCharValueUse`, `isBundle`) pode vir ausente dependendo de `fields`/`clientType`.

### Como um offering vira "bundle"

- `isBundle: true` marca o PO como bundle.
- `bundledProductOffering: [...]` lista os POs-membros (array de `ECM_BundledProductOfferingV4`).
- `isSellable: false` num PO-membro significa que ele **só** pode ser vendido dentro do bundle (texto do contrato acima).
- Hierarquia do bundle é **referência**, não aninhamento profundo: cada membro é um ref de PO.

**Exemplo real (reduzido) — PO básico TMF (payload de criação, `POST /productOffering`):**

```json
{
  "id": "PO_02",
  "name": "PO_02",
  "validFor": { "startDateTime": "2020-12-30T14:25:21.000Z" },
  "isBundle": false,
  "isSellable": true,
  "lifecycleStatus": "In Design",
  "productSpecification": { "id": "PS_3" },
  "category": [{ "id": "CAT_1" }],
  "description": "Description"
}
```

> O contrato **não traz** um exemplo nomeado de "activation bundle prepaid". Ele traz o mecanismo
> (`isBundle` + `bundledProductOffering` + `isSellable:false` nos membros). Nosso "activation bundle"
> (plan + SIM PO + MSISDN PO) é modelável assim, mas isso é **decisão nossa de modelagem**, não um
> exemplo existente no YAML.

---

## 2. ProductOfferingPrice (POP) — recurring vs one-time, período, moeda

### Campos (schema TMF "ProductOfferingPrice", descrição no contrato: "Describes a Product Offering Price in TMF")

| Campo | Tipo | Valores / observação do contrato |
|---|---|---|
| `priceType` | enum | **`Cost` · `Allowance` · `Charge` · `Discount` · `Recurring`** |
| `recurringChargePeriodLength` | integer (int32) | "The period of the recurring charge: 1, 2, etc. It sets to zero if it is not applicable. **Only valid if priceType is recurring.**" |
| `recurringChargePeriodType` | enum | **`One-Time` · `Recurrent` · `Per-Use` · `Allowance` · `daily` · `weekly` · `biweekly` · `monthly` · `annual` · `semiannual` · `secondly` · `minutely` · `hourly` · `custom`**. "The period to repeat the application of the price… **Only valid if priceType is recurring.**" |
| `price` | `TMFMoney` | montante (ver nota abaixo) |
| `unitOfMeasure` | `Quantity` | `{ amount: number, units: string }` |
| `percentage` | number (double) | "percentage to apply for discount" |
| `isBundle` | boolean | preço simples vs. bundle de preço |
| `tax` | array `TaxItem` | `taxCategory`, `taxRate`, `taxAmount` (`TMFMoney`), `includedInPrice` |
| `popRelationship` | array | relações entre POPs |
| `constraint` | array `ConstraintRef` | regra aplicada ao POP (ex.: elegibilidade) |
| `pricingLogicAlgorithm` | `PricingLogicAlgorithm` | PLA (regra de preço) |
| + herdados | | `id`, `name`, `validFor`, `lifecycleStatus`, `description`, `version`, `lastUpdate` |

**`TMFMoney` → `{ unit, value }`.** Não li o bloco de schema `TMFMoney` palavra por palavra, mas a forma
está confirmada por vários exemplos reais do contrato: `price: { unit: "USD", value: 50 }`.

**`Quantity` (schema lido):** `{ amount: number, units: string }` — "Describes the amount in a given unit."

### Exemplos reais (reduzidos)

**POP one-time com preço (`POST /productOfferingPrice`, Example 3):**

```json
{
  "id": "POP_5159411952625146",
  "name": "POP_5159411952625146",
  "priceType": "Charge",
  "recurringChargePeriodType": "One-Time",
  "validFor": {
    "startDateTime": "2021-07-17T14:05:39.152Z",
    "endDateTime": "2021-08-05T14:05:39.153Z"
  },
  "lifecycleStatus": "In Design",
  "price": { "unit": "USD", "value": 50 }
}
```

**POP referenciado dentro de um PO (`priceSpecId` + `price` + `priceCharacteristics`):**

```json
{
  "productOfferingPrice": [
    {
      "priceSpecId": "PSpec_4854345906215645",
      "price": { "unit": "USD", "value": 20 },
      "priceCharacteristics": [
        { "name": "characteristic1", "id": "characteristic1", "valueType": "String", "value": "testString" }
      ]
    }
  ]
}
```

### Como representar "€14,90 / 30 dias · renova automaticamente"

Mapeamento concreto no modelo TMF:

```json
{
  "name": "Drei Go 30d",
  "priceType": "Recurring",
  "recurringChargePeriodLength": 30,
  "recurringChargePeriodType": "daily",
  "price": { "unit": "EUR", "value": 14.90 },
  "lifecycleStatus": "Active"
}
```

- **"€14,90"** → `price = { unit: "EUR", value: 14.90 }`. **Atenção:** `value` é um `number` decimal (os exemplos usam `50`, `20`, `"100.0000"`). O nosso modelo usa **minor units** (`priceMinor` em cents). O mapper precisa converter `value * 100` → cents, e de volta. Veja dívidas na §7.
- **"/ 30 dias"** → `recurringChargePeriodLength: 30` + `recurringChargePeriodType: "daily"`. (Não existe valor de enum `"days"`; o que há é `daily`.)
- **"renova automaticamente"** → `priceType: "Recurring"` é o sinal mais próximo no modelo de **preço**. Não há um campo booleano `autoRenew` no POP (ver §3).

> **Alternativa de modelagem prepago.** Se a oferta for um *activation bundle* one-time (sem recorrência
> real de cobrança), o mais fiel é `priceType: "Charge"` + `recurringChargePeriodType: "One-Time"`, e a
> "validade de 30 dias" vira uma **characteristic**, não um período de cobrança. Decidir isso na Fase 8.

---

## 3. Validade (30 dias) e auto-renovação — existem?

### Validade

- **Não existe** um campo `validityDays` / `durationDays` / `cyclePeriod` em ProductOffering nem em POP.
- O que existe é `validFor` (schema `TimePeriod`: `startDateTime` + `endDateTime`), que é o **período de
  validade do registro de catálogo** (janela em que o PO/POP está vigente), **não** o "ciclo prepago de 30 dias
  que o cliente compra".
- Para POP recorrente há `recurringChargePeriodLength` + `recurringChargePeriodType` — isso modela o
  **período de cobrança** ("a cada 30 dias"), que é o mais próximo de "validade de 30 dias" **quando** a
  oferta é recorrente.
- Para "validade de 30 dias" de um **bundle prepago one-time** (nosso caso), o contrato não tem campo
  dedicado. O caminho fiel ao TMF é uma **ProductSpecCharacteristic / productOfferingChar** (ex.:
  `name: "ValidityDays", value: 30`). Isso é modelagem nossa — o contrato dá o mecanismo (§4), não um
  exemplo pronto.

### Auto-renovação

- **Não existe** campo `autoRenew` em nenhum dos schemas lidos (ProductOffering, POP, ProductSpecification).
- O sinal mais próximo no **preço** é `priceType: "Recurring"` (+ `recurringChargePeriodType`): indica que
  o preço se repete no período, o que operacionalmente é "renova".
- Se o produto precisar de um flag booleano explícito "auto-renovação", ele teria de ir numa
  **characteristic** (`productOfferingChar` ou `prodSpecCharValueUse`), não num campo de primeira classe.

> **Veredito para o nosso campo `autoRenew?`:** o contrato **não contradiz**, mas **não oferece** campo
> dedicado. É representável como `priceType: Recurring` (semântica de preço) e/ou como characteristic
> (flag explícito). É uma dívida de mapeamento, não um bloqueio.

---

## 4. Characteristics — "5G", "EU roaming", "unlimited data", "data allowance"

### Mecanismo

Três lugares distintos para characteristics:

1. **`ProductSpecification.productSpecCharacteristic`** (array `ECM_ProductSpecificationCharacteristicV4`):
   "key features of this product specification" — define a characteristic e seus valores possíveis na PS.
2. **`ProductOffering.prodSpecCharValueUse`** (array): "The available characteristic values for a PS
   Characteristic… can be modified at the PO level. The list of values in this element is a subset of those
   in the PS characteristics." — ou seja, o PO **restringe/seleciona** valores da PS.
3. **`ProductOffering.productOfferingChar`** (array `ProductOfferingCharacteristic`): "Characteristics which
   are defined under PO level (i.e.: they do not exist on PS)." — characteristics que só existem no PO.

### Forma de uma characteristic / value

Campos observados (schema de characteristic + `ProductSpecificationCharacteristicValue`):
`name`, `value` (tipo `object` — "can be null, a primitive, an array or an object"), `valueType`
(ex.: `numeric`, `text`, `CodeTable`, `String`, `Number`, `Attribute Type`), `unitOfMeasure`, `isDefault`,
`minCardinality` / `maxCardinality`, `id`, `validFor`.

**Exemplo real (reduzido) — `prodSpecCharValueUse` num PO (GET `/productOffering`, resposta Extended):**

```json
{
  "prodSpecCharValueUse": [
    {
      "name": "TimeZone Type",
      "minCardinality": 0,
      "maxCardinality": 1,
      "valueType": "CodeTable",
      "productSpecCharacteristicValue": [
        { "isDefault": false, "valueType": "CodeTable", "value": "CTZ", "id": "CTZ", "name": "CTZ" }
      ]
    }
  ]
}
```

**Exemplo real (reduzido) — characteristic de preço (`priceCharacteristics`):**

```json
{
  "name": "Amount",
  "valueType": "Attribute Type new",
  "maxCardinality": 1,
  "productOfferingPriceCharacteristicValue": [
    { "isDefault": true, "valueType": "Attribute Type", "value": "100.0000", "id": "100.0000", "name": "TMF" }
  ]
}
```

### Isso valida ou contradiz nossos campos opcionais?

| Nosso campo opcional (Fase 5) | Representação TMF | Veredito |
|---|---|---|
| `network: '4G'\|'5G'` | characteristic `name:"network"`/`"RAT"`, `value:"5G"` | **Validado como characteristic.** Não existe campo de 1ª classe `network`/`5G` no contrato. |
| `euRoaming: boolean` | characteristic `name:"euRoaming"`, `value:true` | **Validado como characteristic.** Sem campo dedicado. |
| `unlimitedData: boolean` | characteristic `name:"unlimitedData"` ou `dataAllowance` = "Unlimited" | **Validado como characteristic.** Sem campo dedicado. |
| `dataAmount` ("10 GB") | characteristic `value:10`, `unitOfMeasure:"GB"` (ou `Quantity`) | **Validado como characteristic/Quantity.** No TMF é number + unit, não uma string "10 GB". |

> **Conclusão da §4:** nenhum desses atributos é um campo nativo do TMF620. **Todos** vivem como
> characteristics (name/value/valueType[/unitOfMeasure]). Nossos campos opcionais são, portanto, um
> **"achatamento" (flattening) de characteristics** — compatível, mas o mapper precisará ler/escrever a
> estrutura `characteristic` do TMF e projetar para esses booleans/strings. Ver §7.

---

## 5. Categoria / hierarquia (Category) — planos vs. add-ons

### Schema `ProductCategoryV4` (campos-chave)

| Campo | Tipo | Observação |
|---|---|---|
| `id`, `name`, `href`, `description`, `version`, `validFor`, `lifecycleStatus`, `lastUpdate` | | herdados (mesmo enum de status) |
| `parentId` | string | "The unique identifier of the parent product category." |
| `subCategory` | array `ProductCategoryV4` | filhas (recursivo) |
| `productOffering` | array `TMFProductOfferingRef` | POs que pertencem à categoria |
| `categoryCharacteristic` | array `ECM_Characteristic` | characteristics da categoria |
| `isRoot` | boolean | aparece nos exemplos (`isRoot: true/false`); marca raiz da árvore |

### Como agrupar planos vs. add-ons

- A hierarquia é **árvore**: `parentId` (para cima) + `subCategory` (para baixo) + `isRoot`.
- Um PO entra numa categoria de duas formas, ambas no contrato:
  - **Do lado do PO:** `ProductOffering.category: [{ id: "CAT_1" }]`.
  - **Do lado da categoria:** `ProductCategory.productOffering: [{ id: "PO_for_pc" }]` (os exemplos de
    PATCH mostram adicionar/remover/nullificar essa lista).
- **GET `/category`** aceita `depth` (`-1` = todos os níveis; `0` = só raízes, default; `1..9999` = N níveis)
  e `fields`.
- Nos exemplos reais existem categorias raiz nomeadas **`Residential`** (`id: resCatalog`) e **`Enterprise`**
  (`id: entCatalog`), com `productOffering` aninhados (ex.: `Plan with term`).

> **Para o nosso MVNO:** "planos" e "add-ons" seriam duas categorias (ex.: sob uma raiz por marca/tenant),
> cada PO referenciando a sua via `category`. O contrato **não traz** categorias chamadas "plan"/"addon"/
> "data-addon" — esses são nomes do **nosso** domínio (campo `kind`/`category` da Fase 5), que mapeariam
> para `Category.name`/`id` reais do catálogo. Ver §6 e §7.

---

## 6. Filtrar offerings por tenant

### Tenant

- **Não há** parâmetro de query ou campo de corpo `tenant`/`tenantId` nas operações de catálogo.
- O que existe é um **header**: **`X-Tenant-Id`** — descrição literal do contrato:
  **"Tenant identifier, applicable only in multitenancy mode"** (exemplo: `XYZ`).
- Esse header aparece em praticamente todas as operações lidas: GET/POST/PATCH/DELETE de
  `category`, `productOffering`, `productOfferingPrice`.
- (O único `tenant` como *campo* no contrato está no schema de **assinatura de notificação**
  `NotificationSubscription.tenant` — endereço de entrega de evento, **não** é filtro de catálogo.)

> **Para `listOffers(tenant)`:** o tenant vai no **header `X-Tenant-Id`**, não na query nem no path.
> Isto é verificado no contrato.

### Filtro, status e formato

- **`<filtering>`** (query): "Any product category attribute can be used in the filtering criteria.
  Operators AND / OR / or values." Exemplos do contrato:
  - `?name=ABC` (um atributo)
  - `?name=ABC&description=XYZ` (AND)
  - `?name=ABC;lifecycleStatus=Active` (OR, via `;`)
  - `?name=ABC,XYZ` ("or values", via `,`)
  - "The filtering can be used only with the GET all operation."
- **`lifecycleStatus`** é, portanto, um atributo filtrável — ex.: só ofertas vendáveis seriam
  `?lifecycleStatus=Active` (e, do lado do PO, combinar com `isSellable=true`).
- **`clientType`** (query): `TMF` (default) vs `Extended`.
- **`fields`** (query): limita atributos retornados (ex.: `?fields=id,name`; `id` e `href` sempre voltam;
  `fields=none` → só `id` e `href`).
- **`offset` / `limit`** (query, int64): paginação.
- **`depth`** (query): só para Category (níveis de subcategoria).

> **Nota sobre nomenclatura dos endpoints.** Os exemplos usam tanto `/category` quanto `/productCategory`
> no path das descrições. Confirmar o path efetivo de leitura de PO na Fase 8 contra o servidor real; o
> prefixo é `/pcm/productCatalogManagement/v4`.

---

## Tabela: nosso `Offer` ↔ TMF620

| `Offer` (src/services/model.ts) | Campo TMF620 real | Tipo/forma TMF | Observação de mapeamento |
|---|---|---|---|
| `offerId` | `ProductOffering.id` | string | direto |
| `tenantId` | **header `X-Tenant-Id`** | string (header) | **não é campo do payload**; é filtro de request |
| `name` | `ProductOffering.name` | string | direto |
| `dataAmount` ("10 GB") | characteristic (`prodSpecCharValueUse`/`productOfferingChar`) + `Quantity` | `value:number` + `units:string` ("GB") | TMF usa number + unit; nós usamos **string**. Precisa formatar/parsear. "Unlimited" vira characteristic booleana/CodeTable |
| `priceMinor` (cents) | `POP.price.value` | number decimal (`TMFMoney.value` + `unit`) | **converter** `value*100`↔cents; `unit`↔`currency` |
| `currency` ("EUR") | `POP.price.unit` | string ("EUR"/"USD") | direto (string) |
| `validityDays` (30) | — (não existe) | characteristic `"ValidityDays"=30` **ou** `recurringChargePeriodLength`+`recurringChargePeriodType` | **sem campo nativo** — modelar como characteristic (one-time) ou período de cobrança (recurring) |
| `recommended` (bool) | — (não existe campo dedicado) | `marketSegmentRule`/`rule`/characteristic | **sem campo nativo "recommended"**; é lógica/curadoria. Hoje é do nosso domínio |
| `autoRenew?` (Fase 5) | — | `priceType:"Recurring"` **ou** characteristic | sem booleano nativo |
| `euRoaming?` (Fase 5) | — | characteristic `name:"euRoaming"` | sem campo nativo |
| `network?` ('4G'\|'5G') | — | characteristic `name:"network"`/`"RAT"` | sem campo nativo |
| `unlimitedData?` (Fase 5) | — | characteristic | sem campo nativo |
| `kind?` ('plan'\|'addon'\|'activation-bundle') | `isBundle` + `bundledProductOffering` + `Category` | boolean + refs + CategoryRef | 'activation-bundle' → `isBundle:true` + membros; 'plan'/'addon' → categoria |
| `category?` ('starter'\|…) | `ProductOffering.category[].id/name` (`Category`) | CategoryRef | nossos nomes ↔ `Category` reais do catálogo |
| *(implícito: só ofertas ativas/vendáveis)* | `lifecycleStatus=Active` + `isSellable=true` | enum + boolean | filtrar na leitura |

---

## Dívidas / pontos de atenção para a Fase 8 (`catalog-http.ts`)

1. **Tenant é header, não campo.** `listOffers(tenant)` deve enviar `X-Tenant-Id: <tenant>`. Não procurar
   `tenantId` no payload — ele não existe no catálogo. *(verificado no contrato)*

2. **Dinheiro: unit conversion obrigatória.** TMF `price.value` é **decimal** (`14.90`, `50`, `"100.0000"`);
   nosso `priceMinor` é **cents inteiros**. O mapper converte nos dois sentidos e precisa de teste de
   arredondamento. `price.unit` ↔ `currency`. Cuidado: um exemplo traz `value` como **string** (`"100.0000"`)
   em characteristic — validar o tipo real que o servidor devolve em `price.value`.

3. **`validityDays` não tem campo nativo.** Decidir **na Fase 8** entre dois modelos e documentar:
   (a) one-time → characteristic `ValidityDays`; (b) recurring → `recurringChargePeriodLength` +
   `recurringChargePeriodType`. O enum de período **não tem `"days"`**, tem `daily`. Nosso `validityDays`
   atual perde a distinção one-time vs. recurring que o TMF carrega.

4. **Quase todos os nossos atributos "de negócio" são characteristics.** `network/5G`, `euRoaming`,
   `unlimitedData`, `dataAmount`, (provável) `autoRenew` e `validityDays` vivem em
   `prodSpecCharValueUse` / `productOfferingChar` / `productSpecCharacteristic` como `{name, value, valueType,
   unitOfMeasure}`. O mapper precisa de uma **tabela name→campo** (ex.: characteristic cujo `name` bate com
   convenção acordada) e tratar ausência graciosamente. **Risco:** os `name` reais dependem de como o
   catálogo foi modelado no ECM — **não estão fixados no contrato**; confirmar com o catálogo real antes de
   hardcodar nomes.

5. **`dataAmount` string vs. number+unit.** Nosso `"10 GB"`/`"Unlimited"` é uma label. TMF guarda
   `value`+`unitOfMeasure` (number+unit) e "unlimited" seria uma characteristic à parte. Mapear `"10 GB"`
   ↔ `{value:10, units:"GB"}` e `"Unlimited"` ↔ flag — com parser/formatter testados.

6. **`recommended` não existe no TMF.** É curadoria. Hoje é do nosso domínio. Na Fase 8, decidir se vem de
   uma `rule`/`marketSegmentRule`/characteristic do catálogo ou se continua sendo regra nossa. O mock pode
   seguir definindo `recommended` localmente — **não** depender de campo TMF.

7. **Bundle prepago (plan + SIM + MSISDN).** O contrato dá o mecanismo (`isBundle` + `bundledProductOffering`
   + `isSellable:false` nos membros) mas **não** um exemplo pronto de activation bundle. A composição
   "activation bundle" é **modelagem nossa**; validar contra o catálogo ECM real na Fase 8.

8. **ECM vs TMF / `clientType`.** Pedir `clientType=TMF` (ou omitir) para reduzir ruído; se precisarmos de
   characteristics estendidas, `Extended`. O mapper deve ignorar campos `ECM_*`/`@type`/`@baseType`/
   `@schemaLocation`/`translations`/`rule`/`domains` que não usamos.

9. **Filtro de "ofertas vendáveis".** Para a vitrine, combinar `lifecycleStatus=Active` + `isSellable=true`.
   O contrato permite filtrar por atributo (`?lifecycleStatus=Active`) **só no GET all**. Confirmar quais
   atributos de PO são filtráveis no servidor (o texto de filtering está na doc de *category*; assumir o
   mesmo para PO e **verificar** na Fase 8).

10. **Path de leitura de PO.** Prefixo `/pcm/productCatalogManagement/v4`; descrições alternam `/category` e
    `/productCategory`. Confirmar o path real de `GET` de ProductOffering contra o servidor antes de fixar a
    URL no driver.

### O que o nosso `Offer` simplificado perde (resumo concreto)

- **Perde:** distinção one-time vs. recurring (achada em `priceType`/`recurringChargePeriod*`); período de
  validade do *registro* (`validFor`) vs. ciclo comprado; cardinalidade e `isDefault` de characteristics;
  `isSellable` (stand-alone vs. só-em-bundle); a estrutura de bundle (`bundledProductOffering`); taxas
  (`tax`/`TaxItem`); `unitOfMeasure` real do data allowance.
- **Não representa** (e precisará de characteristics/estrutura extra no futuro): multi-valor de
  characteristics, constraints/elegibilidade (`constraint`, `pricingLogicAlgorithm`), segmentação
  (`marketSegmentRule`).
- **Oferece a mais que usamos:** `recommended` e os booleans de negócio — são projeções nossas, sem
  equivalente nativo, que o mapper terá de **derivar** de characteristics/regras do catálogo.
```