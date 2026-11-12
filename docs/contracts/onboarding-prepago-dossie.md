# Onboarding pré-pago (newLine) — destilado do HLD/LLD · fonte de verdade da Fase 7

> Destilação do dossiê interno **SPM/DXP, 25/09/2026** — `onboarding-prepago-HLD.docx` +
> `onboarding-prepago-LLD.docx` (OneDrive de Tatiana Fagundes, indexado no Glean). O dossiê
> descreve a jornada **`newLine`**: uma pessoa que ainda não é cliente contrata uma linha
> pré-paga nova, com **SIM físico ou eSIM**, pelo PWA. Esta é a base da Fase 7.
>
> Fonte: Glean (docs internos Ericsson). Links:
> - HLD: `…/docs/dossie/onboarding-prepago/hld-lld/onboarding-prepago-HLD.docx`
> - LLD: `…/docs/dossie/onboarding-prepago/hld-lld/onboarding-prepago-LLD.docx`
> Conteúdo reproduzido/parafraseado dos snippets indexados; nada inventado.

---

## ⚠️ Nota de escopo — dossiê vs nosso app

O dossiê é a planta de um **produto real** sobre o **Journey Mesh** (Camunda 7 / BPMN), com um
BFF dedicado, Composite API (16 operações), 48 operações de costura, registro de jornada
transacional, três mercados (EUA / Catar / México) e provisionamento assíncrono de dias.

O **`pocket-signal-care`** é um **PWA React com seams/mocks client-side** e orquestração no
cliente. Portanto:

- **NÃO replicamos** Journey Mesh, BFF, Composite API, registro transacional, Party Interaction,
  BPMN. (Mesma postura já registrada em `dxp-xcac-orchestration.md`: a UI + `api.ts` fazem o
  papel do BFF; a orquestração do submit no cliente simula a jornada.)
- **Reusamos como requisito e decisão**: a **forma do fluxo**, a bifurcação **SIM/eSIM**, quando
  o **endereço** aparece, o **modelo de dinheiro em três tempos**, os **contratos TMF** que
  nomeiam os seams, e os **estados de recibo**.
- O mock é **fiel aos contratos e aos estados**, não à infraestrutura.

Mercados: o dossiê cobre EUA (sem identidade), Catar (identidade por provedor) e México
(documento digitado). **Fase 7 fica no caso-base EUA (sem identidade).** Identidade (Catar/México)
é dívida explícita — ver no fim.

---

## 1. A forma do fluxo (HLD §2.3)

Passos antes do pedido, e o recálculo do "Step N of M":

> `N = 6` (plan, number, details, firstTopUp, review, + account/email) **+1 se eSIM oferecido**
> (passo `/sim`) **+1 se identidade por provedor** (Catar) **−1 se escolheu eSIM** (sem entrega).

- `/sim` ("How do you want your SIM?") só existe se a operadora **oferece eSIM**.
- **SIM físico** → exige `/delivery` (endereço), rastreio, ativação por **ICCID** (a pessoa digita
  19–20 dígitos).
- **eSIM** → **sem entrega**; perfil gerado no **SM-DP+** (GSMA SGP.22), código/QR, três caminhos
  de instalação ("neste telefone" / "escanear de outro" / "digitar o código").
- Confirmação de e-mail por código é obrigatória **antes do pedido** (já temos auth seam; o código
  em si é dívida — hoje o onboarding cria conta direto).

## 2. SIM físico vs eSIM (LLD §1.8.4, §5.2.3)

- `SimValidation.simType` já existe no nosso `model.ts` (`"physical" | "esim"`) — mas o mock
  sempre devolve `physical` e o onboarding não pergunta. Fase 7 torna a escolha de primeira classe.
- **eSIM** (costura de recurso, extensão `esimProfile` sobre TMF639/TMF685 + GSMA SGP.22 ES2+):
  - `requestEsimProfile(communicationId, eid?) → { esimProfileId, iccid, activationCode, installUrl?, expiresAt, status }`
    com `status ∈ requested | ready | failed`. `activationCode` no formato `LPA:1$<smdp>$<match>`.
  - `getEsimProfile(...) → { state, activationCode, expiresAt, reasonKey }`, `state ∈ requested |
    ready | downloaded | installed | deleted | expired | failed`.
  - Instalação chega por notificação do SM-DP+ (push) **ou** é lida como item da ordem (none).
- **SIM físico**: provisionado como item da ordem; ativação digitando o ICCID (`resource.getResource`
  valida: existe, é deste pedido, não está ativo).

## 3. Address management — TMF673 (LLD §2.5, §5.2.4; confirmado no DXP TPD)

- O DXP TPD (Glean): *"Address information is mastered in an external address management system and
  retrieved through connector"* — exposto como **TMF673 Geographic Address Management**.
- O endereço é **dado pessoal**: mora no rascunho da operadora antes do pedido; no submit a jornada
  chama **`logistics.createAddress`** (TMF673 `POST /geographicAddress`) e recebe um `addressId` que
  entra na ordem. **Só para SIM físico.**
- Campos: `{ line1, line2?, city, region, postalCode, country }`. Erro de negócio:
  `addressOutsideDeliveryArea`.
- Costura de logística (LLD §5.2.4): `createAddress` (TMF673), `listDeliveryOptions` (extensão),
  `getShipment` (TMF684), `reship` (TMF700).

## 4. Payment gateway — autoriza → captura → credita (HLD §3; LLD §5.2.1)

**Dinheiro em três tempos** — o coração do modelo pré-pago:

| Tempo | Quando | Quem | Pessoa vê |
|---|---|---|---|
| **Autoriza** | no pedido | costura de pagamento | "Authorized {date}" (reserva, não cobra) |
| **Captura** | no marco (SIM despachado / eSIM pronto; com identidade, após aprovação) | costura de pagamento | "Charged {date}" |
| **Credita** | na ativação | **fulfilment da operadora** (não a jornada) | "Added {date} · {amount}" |

- Gateway via **extensão `paymentAuthorization`** (`authorize` sem capturar, `completeChallenge`
  do 3-D Secure, `getPayment`, `capture`, `voidAuthorization`, `reauthorize`, `refund`) +
  **TMF676** (registro do pagamento, espelho para conciliação) + **TMF670** (métodos salvos).
- Confirmado no **DXP TPD** (Glean): existem **DXP Payment Gateway Connector/Service** e **DXP
  Payment Management** com *"Payment method management (TMF670), Payment posting (TMF676),
  tokenized card, cash and external payment methods"*. Também no recharge BUC: *"selfcare channels
  integrate with the payment gateway directly … payment is committed through payment gateway then
  order is created and submitted"*.
- **PSP parametrizável** (Stripe/Adyen/Checkout.com) por operadora; **campos hospedados** tokenizam
  o cartão — **o número do cartão nunca toca o nosso código**.
- Validade da autorização ~5 dias (configurável); timer vigia até a captura; perto do vencimento,
  `reauthorize` (cobrança iniciada pelo comerciante) ou pede confirmação à pessoa (`confirmPayment`
  com `actBy`).
- **Voucher** como alternativa ao cartão: conferido antes do pedido, resgatado na ativação; sem
  cartão/autorização/captura.

### Estado do dinheiro no recibo (LLD §2.4)
`firstTopUp.state ∈ authorized | captured | credited | voided | authorizationFailed |
captureFailed | creditFailed | refunded`. Regra de ouro: **cobrado e não creditado nunca cobra de
novo** ("Don't pay again").

## 5. Palavras de dinheiro (HLD §2.2, §3.4) — regras de UI

- Reserva no cartão é sempre **"authorize"** (nunca "hold"); cobrança é **"charged"**; crédito é
  **"added"**. Proibido: "hold", "soon", "minutes", "free".
- A **tela nunca soma** — total/taxas/bônus vêm da cotação ou do recibo.
- Cada frase de dinheiro só aparece **com o campo que a prova**; sem o campo, não há frase.
- Botão do pedido é **"Place order"**, nunca "Pay" (nada é cobrado ao confirmar).
- Dinheiro em **minor units** + ISO 4217 (já é a nossa convenção).

## 6. Contratos TMF que a Fase 7 usa (LLD "Costuras como TMF v5")

| Costura | API TMF | Operações (mock) |
|---|---|---|
| recurso / eSIM | TMF639 + TMF685 + ext. `esimProfile` (GSMA SGP.22) | requestEsimProfile, getEsimProfile |
| logística / endereço | TMF673 + TMF684 + TMF700 + ext. `deliveryOption` | createAddress, listDeliveryOptions, getShipment, reship |
| pagamento | ext. `paymentAuthorization` + TMF676 + TMF670 | authorize, capture, voidAuthorization, getPayment, (refund, reauthorize) |
| ordem | TMF622 | submitOrder com item de SIM (physical/esim), topUp, endereço |
| saldo | TMF654 | getCredit, credit |

## 7. O que a Fase 7 (mock) implementa vs o que fica como dívida

**Implementa (fiel aos contratos/estados, client-side):**
- Escolha SIM físico vs eSIM no onboarding (passo `/sim` condicional).
- Endereço de entrega (TMF673 mock) quando SIM físico — passo `/delivery`.
- Provisionamento eSIM mock (código/QR, estados do perfil) quando eSIM.
- **Payment gateway mock** com os três tempos: authorize no pedido → capture no marco → credit na
  ativação; cartão tokenizado mock; estados do recibo.
- Ativação por ICCID (SIM físico) — reusa `resource.validateSim`.

**Dívida consciente (não cabe no mock / é integração real — Fase 8+):**
- Journey Mesh / BPMN / Composite API / BFF reais.
- 3-D Secure real, PSP real, tokenização real (campos hospedados).
- Identidade por provedor (Catar) e documento digitado (México).
- Reautorização MIT, polling assíncrono de dias, webhooks de PSP/SM-DP+/transportadora.
- Registro de jornada transacional e trava de pedido duplicado atômica.
- Retomada entre dispositivos / rascunho na operadora.
