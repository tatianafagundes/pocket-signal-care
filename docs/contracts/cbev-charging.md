# CBEV (Charging & Billing Evolved) — Knowledge Base

> O southbound do nosso **`charging` seam** (`getBalance` / `topUp` / `rateAndDeduct`). O CBEV é
> onde vive o saldo prepaid (wallet/buckets). Base a partir da doc interna do DXP/CBEV indexada no
> Glean. Fecha a investigação de contratos: catálogo, qualificação, cart, ordering, inventory,
> CPR, orquestração (XCAC/Journey Mesh), billing BIH e **agora charging**.

## Fontes (Glean — docs internos Ericsson)

- **BSS TMF654 Prepay Balance Management REST Interface** — doc 5/155 19-FAY 302 636/1 (CBEV, rev. até 1.4) e 155 19-FAY 302 637-V1 (DXP, "inspired on TMF654 4.0.0").
- **BSSF Consolidated Customer Management REST Interface** — doc 2–3/155 19-FAY 302 706/1 (CBEV 23.11+, v1.0–1.2).
- **BSSF Balance Management REST Interface** — doc 14_15519-FAY302340_2 (v2.13).
- **CBEV Integration Guide** — doc 33/10272-CSH 109 900 (lista BSSF + BSS TMF; auth; ingress).
- **API Examples Guide** (CBEV) — doc 26/1551-CSH 109 900 (operations + exemplos).
- **BAE Overview Guide** — doc 7/1551-CSH 109 900 (BAE = API Exposure Layer que expõe tudo isto).
- OPs DMP Evolved (BUC 343A_4, 349A_5, EC_DMP-3665/3673) — mapeamentos reais DXP↔CBEV.

> **O que é o CBEV/BEAM/BAE:** CBEV = Charging & Billing Evolved (também "BEAM"). As APIs são
> expostas pela **AEL/BAE** (API Exposure Layer). O CPR do DXP **federa** daqui — ele busca **só o
> balance** no CBEV no momento da consulta (party/customer são locais no CPR). Auth = **OAuth2**
> (IAM externo); ingress `bss-trf`.

---

## 1. TMF654 Prepay Balance Management — o coração do nosso charging seam

A API de **saldo prepaid**. Três recursos (confirmado na spec BSS TMF654):

| Recurso | Operação | Endpoint real | Nosso seam |
|---|---|---|---|
| **Bucket** | GET — listar buckets/saldo do produto | `GET /bae/bssTmf654PrepayBalanceManagement/v1/bucket` | **`getBalance`** |
| **TopupBalance** | POST — recarga | `POST /bae/bssTmf654PrepayBalanceManagement/v1/topupBalance` | **`topUp`** |
| **AdjustBalance** | POST — ajuste (+/−) | `POST /bae/bssTmf654PrepayBalanceManagement/v1/adjustBalance` | **`rateAndDeduct`** (ajuste negativo) |

**Modelo (campos reais da spec):**
- Saldo vive em **buckets** (`ProductBucketBalance`, `BillingAccountBucketBalance`). Prepaid usa o **product bucket**.
- `amount` / `highPrecisionAmount` (`Decimal_Sensitive`) — valor; `validFor` / `validForBefore` / `validForAfter` (`TimePeriod`) — validade do bucket (!); `calculatedDuration`.
- `AdjustBalance`: `reservationAware` (`IGNORE`/`CONSIDER`/`KEEP`), `adjustType`, `partyAccount` (`PartyAccountRef`), `product` (`ProductRef`), `contract` (`ContractRef`), `bucket` (`BucketRef`), `productImpactedBucket` (saldo resultante).
- `relatedParty` identifica o cliente (`externalId`, `@referredType: "Customer"`); ou `communicationId` (MSISDN).
- Auth = **JWT** no header; versionamento na URL.

**Fato histórico importante (arquiteto CBEV, confirmado):** o TMF654 **originalmente só lia saldo**
(a recarga era via **BSSF Balance Management**). O CBEV depois adicionou `TopupBalance` e
`AdjustBalance`, então hoje o TMF654 **faz as três** (ler, recarregar, ajustar). Ao integrar, usar
**TMF654** (padrão novo), não a BSSF Balance Management (caminho legado).

---

## 2. `rateAndDeduct` real = Payment Connector + AdjustBalance negativo

O nosso `rateAndDeduct` (debitar saldo) no real é o **CBEV Payment Connector** (visto no CPR KB
como "CBEV Payment Connector, não TMF654" — agora refinado):

- O **DXP Payment Connector** (`POST /payment` / `/refund`, Payment 4.0.x) mapeia para o
  **CBEV AdjustBalance** com `amount.number` **negativo** (débito) ou positivo (crédito/estorno).
- Mapping real (EC_DMP-3673): `POST /payment` → `POST /bae/bssTmf654PrepayBalanceManagement/v1/adjustBalance`
  (antes era `POST /bae/bssfBalanceManagement/v1/bucketAdjustment/adjust` — legado, depreciado na BSSF 2.12).
- `payer.id` → `relatedParty.externalId`; `payer.@referredType` → `"Customer"`; `communicationId` = MSISDN.
- Isto é usado pelo **SLCM Payment Connector** na renovação de assinatura (débito automático).

> **Refina o nosso KB:** o `rateAndDeduct` do nosso seam é conceitualmente um **AdjustBalance
> negativo** no TMF654 (via Payment Connector), **não** uma operação TMF654 própria chamada
> "rateAndDeduct". O mock atual (deduz de um customer, recusa negativo) é uma simplificação honesta.

---

## 3. Consolidated Customer — valida (e pode substituir) o nosso `getCustomer360`

A **BSSF Consolidated Customer Management** (`GET /bae/bssfConsolidatedCustomerManagement/v1/consolidatedCustomer`)
faz **num único call** o que o nosso `getCustomer360` compõe:

- Agrega **Customer + Contract + Product + Party + Balance** (internamente combina Customer Enquiry,
  Subscription Enquiry, Individual/Organization Party Enquiry, Balance Enquiry).
- **Identificadores:** `communicationId` (+Type, ex. MSISDN) **OU** `customerId`+`contractId`
  (interno ou externo). Só uma combinação.
- **Filtros booleanos:** `includeParty`, `includeBalance`, etc. — controlam o payload.
- Devolve só o **installed base do lado CBEV** (contract[], product[], buckets) — **não** a
  realização técnica do Service Registry (serviço/recurso/rede/ativação), que fica no SR.

**O que isto nos ensina (OP CBEV Convenience API):** no modelo CPR-federado, o DXP **não** usa o
Consolidated como fan-out — ele serve party/customer **localmente do CPR** e chama o CBEV **só para
balance** (`includeParty=false&includeBalance=true`). Ou seja, o nosso `getCustomer360` com fan-out
(party/customer do CPR + installed base + **balance do CBEV**) é **exatamente o modelo real**.
Alternativa: um consumidor pode usar o Consolidated para ler tudo direto do CBEV, bypassando a
federação — mas não é o caminho do CPR.

---

## 4. As 8 TMF + 3 BSSF que você listou — mapeadas ao nosso escopo

| Interface (CBEV) | Precisamos? | Nota |
|---|---|---|
| **BSS TMF654 Prepay Balance** | **SIM — é o nosso charging seam** | getBalance/topUp/rateAndDeduct. §1–2. |
| **BSSF Consolidated Customer** | **Útil — valida/opcional p/ Customer 360** | §3. CPR usa só p/ balance; gancho p/ 360 completo. |
| **BSSF Balance Management** (v2.13) | Legado | Caminho antigo de recarga/ajuste; **substituído pelo TMF654**. Dívida: não usar no novo. |
| **BSS TMF629 Customer / TMF632 Party** | Indireto | Southbound do CPR (já em `dxp-customer-management-cpr.md`). CBEV os expõe, mas o DXP serve local. |
| **BSS TMF637 Product Inventory** | Indireto | Installed base do lado CBEV; o nosso é o order seam / SR. |
| **BSS TMF669 Party Role** | Não | Papéis de party (B2B/família). Fora do prepaid self-care single-role. |
| **BSS TMF666 Account / TMF678 Bill / TMF676 Payment** | Não | Billing/postpaid (billing account, fatura, pagamento financeiro). Fora do prepaid. (Reforça o ponto do billing account — §Billing.) |
| **BSSF Customer Management / Subscription Management** | Indireto/Não | Customer/contract no CBEV; o DXP cria via CPR→CBEV. Subscription = o "contract" (já mapeado). |

---

## Tabela: nosso `charging` seam ↔ CBEV TMF654

| Nosso seam (`api.ts`) | CBEV real | Observação |
|---|---|---|
| `getBalance(customerId)` → `Balance\|null` | `GET /bae/bssTmf654PrepayBalanceManagement/v1/bucket` (product bucket) | saldo vem do bucket; `null` = sem bucket ainda (cliente novo). Confirma a nossa decisão de `null`. |
| `topUp(customerId, amountMinor)` | `POST .../topupBalance` | recarga; amount `Decimal_Sensitive`. |
| `rateAndDeduct(customerId, amountMinor)` | `POST .../adjustBalance` (negativo), via Payment Connector | débito; `reservationAware`; recusa abaixo de 0 = regra de domínio (o nosso mock já faz). |
| (identificador) | `relatedParty.externalId` + `@referredType:"Customer"` ou `communicationId`=MSISDN | tenant/cliente. |
| (dinheiro) | `amount`/`highPrecisionAmount` decimal | converter ↔ `priceMinor` cents (como no catálogo). |
| (auth/tenant) | **OAuth2** (IAM); ingress `bss-trf` | não é só Bearer-JWT estático — é OAuth2 client credentials contra o IdP do CBEV. |

---

## Dívidas / pontos de atenção Fase 8 (`charging-http.ts`)

1. **Usar TMF654, não BSSF Balance Management.** `getBalance`→`GET /bucket`;
   `topUp`→`POST /topupBalance`; `rateAndDeduct`→`POST /adjustBalance` (negativo). A BSSF Balance
   Management é o caminho legado (depreciado).
2. **`rateAndDeduct` passa pelo Payment Connector** no fluxo real (não é operação TMF654 crua) —
   decidir se o `charging-http` chama o AdjustBalance direto ou via o Payment Connector do DXP.
3. **Saldo é bucket, com validade própria** (`validFor`). O nosso `Balance { amountMinor, validUntil? }`
   captura o essencial; o real tem múltiplos buckets por produto — simplificamos para um saldo.
4. **Dinheiro decimal↔cents** — igual ao catálogo; `Decimal_Sensitive` (alta precisão) ↔ `priceMinor`.
5. **Auth OAuth2** (IAM externo do CBEV), ingress `bss-trf` — diferente do simples Bearer dos outros;
   o `charging-http` precisa de client-credentials flow.
6. **Consolidated Customer** é um gancho opcional para o Customer 360 completo; o padrão CPR é
   fan-out com balance-only. Manter o nosso fan-out.
7. **`null` vs €0** confirmado: cliente novo sem bucket → sem saldo (não €0). Alinhado à spec.

### Confirma o que já estava certo
- `getBalance`/`topUp`/`rateAndDeduct` como as três operações do charging ✔ (= Bucket/Topup/Adjust do TMF654)
- `balance: null` para cliente novo ✔ (sem bucket ainda)
- `rateAndDeduct` recusando saldo negativo ✔ (regra de domínio, `reservationAware`)
- Customer 360 busca balance no CBEV via fan-out ✔ (modelo CPR-federado real)
- Dinheiro em unidades (converter decimal↔cents) ✔
