# Fase 7 — Análise de impacto: SIM/eSIM + endereço (TMF673) + payment gateway mock

> Impacto de adicionar ao onboarding a escolha **SIM físico vs eSIM**, a captura de **endereço de
> entrega** (TMF673) e um **payment gateway mock** com os **três tempos** (autoriza → captura →
> credita), **fiel ao dossiê** `docs/contracts/onboarding-prepago-dossie.md`, em **versão mock
> client-side**, no **caso-base EUA (sem identidade)**.
>
> Cada item marca **[fiel]** (segue o dossiê) ou **[mock]** (simplificação consciente do mock).
> Nada aqui é código ainda — é o mapa que a spec da Fase 7 vai seguir.

Legenda de arquivos: todos relativos a `~/pocket-signal-care`.

> **Revisão multi-perspectiva (2025-02-16) aplicada.** Duas perspectivas independentes revisaram
> este plano (`docs/design/2025-02-16-fase7-plan-review.md`, design/UX; e uma verificação do
> impacto contra o código real). As correções abaixo foram incorporadas. Decisões de produto
> confirmadas pela dona:
> 1. **first top-up = preço do plano é o MESMO dinheiro** — você autoriza €X, esse €X vira o seu
>    primeiro saldo, e o saldo paga o plano. Um valor, um propósito. A cópia DEVE dizer isso.
> 2. **A tela nunca soma** — `/review` lê o `priceMinor` do plano via helper, rotulado
>    "Plan · first top-up"; não existe cotação no mock e a UI não soma nada.
> 3. **Sem oferta eSIM-only no catálogo** por ora → `/sim` fica após `/plan` (razão: condiciona
>    `/delivery` e pode restringir por `Offer.simTypes` no futuro). Registrado, não é gosto.
> 4. **Ativação por ICCID é pós-entrega, FORA da Fase 7.** O `/success` do SIM físico mostra
>    "SIM a caminho", não pede ICCID. A ativação por ICCID é jornada futura.

---

## 0. Decisão central — como o dinheiro entra (resolve a pergunta de "falta pagamento")

O dossiê é explícito (HLD §3): **pré-pago autoriza no pedido, captura no marco, credita na
ativação** — e **quem credita é o fulfilment**, não a jornada. Isso corrige a minha afirmação
anterior de que "o pré-pago cobra no top-up": no **onboarding** há sim pagamento, mas é
**autorização** (reserva no cartão), não cobrança imediata.

No nosso mock mapeamos os três tempos assim:

| Tempo (dossiê) | Gatilho no nosso fluxo | Seam/efeito no mock |
|---|---|---|
| **Autoriza** | confirmar o pedido em `/review` | `payment.authorize` → reserva (nada debita) |
| **Captura** | marco: SIM físico "despachado" / eSIM "pronto" | `payment.capture` → estado `captured` |
| **Credita** | ativação da linha (success) | `api.topUp({ customerId, amountMinor })` credita o saldo |

> ⚠️ **Assinatura corrigida**: a api/seam é `api.topUp({ customerId, amountMinor })` (objeto,
> validado por `topUpSchema`); a forma de dois argumentos posicionais é só do *driver*.

> **[mock]** No dossiê o fulfilment credita e a jornada só confere; no nosso mock **a orquestração
> credita via `charging.topUp`** (o `charging-mock` já credita saldo). É a simulação honesta de
> `order.creditsFirstTopUp = false`, caminho que o próprio dossiê prevê (LLD §5.2.7). **Não**
> usamos `rateAndDeduct` para a 1ª recarga (isso é débito, não crédito).

> **[mock]** Marco de captura: como o mock não despacha SIM de verdade nem fala com SM-DP+ real, o
> "marco" é simulado — na prática a captura acontece logo após o submit (SIM físico: ao
> "despachar" simbólico; eSIM: ao gerar o perfil). O ciclo assíncrono de dias é dívida.

---

## 1. Modelo de dados — `src/services/model.ts`

**[fiel] `Offer` ganha `simTypes`.** O dossiê (LLD §5.2.18) traz `Offer.simTypes[] ∈ physical,
esim`. Hoje a `Offer` não diz quais SIM aceita. Adicionar opcional `simTypes?: ("physical" |
"esim")[]` — a ausência = ambos (retrocompatível, como os outros campos de enriquecimento).

**[fiel] `SimChoice`** = `"physical" | "esim"` (reusa a união de `SimValidation.simType`, que já
existe).

**[fiel] `DeliveryAddress`** (TMF673): `{ line1: string; line2?: string; city: string; region:
string; postalCode: string; country: string }`. Dado pessoal.

**[fiel] `EsimProfile`** (extensão `esimProfile`): `{ esimProfileId; iccid; activationCode;
installUrl?; expiresAt; status: "requested" | "ready" | "failed" }` + leitura `state ∈ requested |
ready | downloaded | installed | deleted | expired | failed`.

**[fiel] `PaymentResult`** (extensão `paymentAuthorization`): `{ authorizationRef; status;
amountMinor; currency; authorizationExpiresAt?; methodLabel? }`, `status ∈ authorized |
requiresAction | declined | captured | captureFailed | voided | refunded | pending`.

**[fiel] `FirstTopUp` no recibo**: estado do dinheiro `state ∈ authorized | captured | credited |
voided | authorizationFailed | captureFailed | creditFailed | refunded` + `amountMinor`,
`methodLabel`, `authorizedAt?`, `capturedAt?`, `creditedAt?`.

**[mock] Tokenização**: o cartão vira um `paymentMethodToken` **mock** gerado client-side (ex.:
`tok-mock-<brand>-<last4>`), sem PSP real. `methodLabel` = "Visa ending 4242" montado do mock.

---

## 2. Estado do wizard — `src/lib/onboarding-context.ts` + `onboarding-persistence.ts`

`OnboardingState` ganha (todos não-secretos, seguros para sessionStorage):

- **[fiel]** `simType: "physical" | "esim" | null` — a escolha do passo `/sim`.
- **[fiel]** `deliveryAddress: DeliveryAddress | null` — só quando `physical`.
- **[fiel]** `addressId: string | null` — devolvido por `logistics.createAddress` no submit.
- **[fiel]** `paymentMethodToken` **NÃO** persiste como segredo — o token mock pode ficar em
  memória do form; o que persiste é só `methodLabel` para o recibo. (Mesma disciplina do password.)
- **[fiel]** ids de orquestração novos: `orderId`, `authorizationRef`.

`onboarding-persistence.ts`: adicionar os campos ao `initialOnboardingState` e ao sanitizador
(`str`/`strArray`/novo validador de objeto para `deliveryAddress`).

> **[mock]** Número do cartão / CVV **nunca** entram no estado nem no sessionStorage (não há PSP;
> o form mock os descarta após gerar o token). Mesma regra do password (Fase A).

---

## 3. Passos do onboarding — `src/lib/onboarding-context.ts` (`ONBOARDING_STEPS`) + rotas

**[fiel] Dois passos novos, condicionais:**

- `/onboarding/sim` — "How do you want your SIM?" (physical vs eSIM). Só aparece se o tenant
  **oferece eSIM** (todo offer com `simTypes` incluindo `esim`; hoje seria sempre, então a decisão
  de ofertar eSIM é por tenant no catálogo).
- `/onboarding/delivery` — endereço. Só aparece se `simType === "physical"`.

Ordem nova (caso-base EUA): `welcome → plan → [sim] → addons → number → account → delivery(se
physical) → firstTopUp → review → success`.

> **Decisão de ordem**: o dossiê põe `firstTopUp` (valor da 1ª recarga) como passo próprio antes
> da revisão. **[mock]** Hoje não temos passo de "valor da recarga" — o nosso onboarding ativa com
> o plano. **Proposta**: na Fase 7 o "firstTopUp" = **o preço do plano** autorizado no cartão (o
> plano É pago pela 1ª recarga, HLD §1). Então **não** criamos passo de valor separado agora; o
> valor é o `priceMinor` do plano. O passo de valor livre fica como dívida.

**Impacto no stepper** (`ONBOARDING_WORKING_STEPS` / `ONBOARDING_WORKING_STEP_COUNT`): ⚠️ **CORRIGIDO
pela revisão** — M **já é derivado** (`ONBOARDING_WORKING_STEP_COUNT = ONBOARDING_WORKING_STEPS.length`,
hoje = 6). O trabalho real **não** é "tornar derivado", é tornar a **lista de passos condicional**
ao `simType` e à oferta de eSIM (dossiê R-2). Hoje `ONBOARDING_WORKING_STEPS` é um `const` de módulo
consumido como constante estática por **`src/components/onboarding/wizard-page.tsx`** e
**`src/components/onboarding/onboarding-stepper.tsx`** — os dois **precisam** passar a receber a lista
de passos como valor de runtime (prop), não importar a constante. **Isso é um refactor de dois
componentes, não uma linha** (os dois faltavam na tabela §8 — corrigido). Cuidado de UX (ver S5 do
plan-review): escolher eSIM **remove** `/delivery` e faz M cair no meio do fluxo; decidir se M só
conta passos já garantidos ou se o stepper só mostra M após o SIM escolhido.

**Impacto no guard** (`src/lib/onboarding-guard.ts`): `firstIncompleteStep` ganha os gates novos.
⚠️ **Posição do `/sim` resolvida** (havia inconsistência interna): `/sim` fica **após `plan`**
(coerente com a ordem de passos, não "após number"). Gates:
- após `plan`: se eSIM é oferecido e `simType == null` → `sim`.
- antes de `review`: se `physical` e `deliveryAddress == null` → `delivery`.
- `/sim` e `/delivery` são **gates reais** (ao contrário de addons que é opcional).
- `ORDER` continua derivado de `ONBOARDING_STEPS` (sem drift).

**Rotas novas**: `src/routes/onboarding/{sim,delivery}.tsx` + registro no StepGuard
(`src/routes/onboarding.tsx`).

---

## 4. Seams novos — `src/services/driver-config.ts` + novos diretórios

**[fiel] `SeamName`** ganha `"payment"` e `"logistics"` (+ `ENV_KEY` `VITE_PAYMENT_DRIVER`,
`VITE_LOGISTICS_DRIVER` — exaustivo, senão o typecheck quebra, como foi feito no auth na Fase A).
O eSIM **cabe no `resource`** (é a costura de recurso no dossiê) — não precisa de SeamName novo.

**Novos seams (mock + driver + http-stub, padrão idêntico aos existentes):**

- **[fiel] `payment`** (`src/services/payment/`): `authorize({ customerId, amountMinor, currency,
  methodToken }) → PaymentResult`; `capture(authorizationRef) → PaymentResult`;
  `voidAuthorization(authorizationRef) → { ok }`; `getPayment(authorizationRef) → PaymentResult`.
  Mock: gera `authorizationRef`, guarda estado em memória; cartão mock `4242…` autoriza, `4000…`
  recusa (regra determinística p/ o caminho de erro, como o ICCID `0000` no resource).
- **[fiel] `logistics`** (`src/services/logistics/`): `createAddress(DeliveryAddress) → {
  addressId }`; (opcional) `listDeliveryOptions(region) → Option[]`. Mock: valida campos; endereço
  terminando em algo determinístico → `addressOutsideDeliveryArea` (caminho de erro).
- **[fiel] eSIM no `resource`**: `requestEsimProfile({ customerId }) → EsimProfile`;
  `getEsimProfile(esimProfileId) → { state, activationCode, expiresAt }`. Mock: gera
  `LPA:1$smdp.mock$<match>`, `status: "ready"`.

**`api.ts`**: expor `api.authorizePayment`, `api.capturePayment`, `api.getPayment`,
`api.createAddress`, `api.requestEsimProfile`, `api.getEsimProfile` (padrão unwrap→SeamFailure).

**Schemas** (`src/schemas/`): zod para cada entrada nova (payment, logistics, esim).

---

## 5. Orquestração do submit — `src/lib/onboarding-submit.ts`

Hoje: `createParty → createCustomer → createCart → addItem(plan) → addItem(SIM) → [addons] →
submitOrder`. A sequência nova (caso-base EUA), fiel ao dossiê:

1. party/customer (idempotente, como hoje).
2. **[fiel]** `authorize(plan price)` **ANTES** de criar a ordem (dossiê: autoriza antes de criar
   qualquer coisa; cartão recusado não cria nada). Recusa → erro terminal sem party órfão... (nota:
   hoje party já existe antes; **[mock]** aceitamos a simplificação de que party/customer são
   idempotentes e reusados; o dossiê desfaz tudo numa transação — fora do nosso alcance).
3. **[fiel]** se `physical`: `createAddress(deliveryAddress) → addressId`.
4. cart: `addItem(plan)`, `addItem(SIM físico OU perfil eSIM)`, `[addons]`.
5. `submitOrder(cart, { addressId?, simType })`.
6. **[fiel]** `capture(authorizationRef)` no marco (mock: logo após submit).
7. **[fiel]** `charging.topUp(customerId, planPriceMinor)` = credita a 1ª recarga na ativação.

`SubmitStep` ganha: `"authorize"`, `"createAddress"` (se physical), `"capture"`, `"credit"`.

> ⚠️ **REGRA CRÍTICA DE IDEMPOTÊNCIA (achado da revisão — o ponto mais importante do dinheiro).**
> `authorizationRef` e `orderId` **DEVEM** ser persistidos via `patch` e **reusados no retry**,
> exatamente como `partyId`/`customerId` hoje. Senão um retry **autoriza o cartão duas vezes**
> (dupla reserva) — viola a regra de ouro do dossiê ("Don't pay again"). E os passos pós-submit
> (`capture`, `credit`) precisam de **regra de resume explícita**: `capture` só se há
> `authorizationRef` e ainda não capturado; `credit` só se ainda não creditou (senão o saldo
> dobra). `submitOrder` em si já é idempotente no mock? NÃO — o cart é consumido; o retry tem de
> pular `submitOrder` se `orderId` já existe no estado.

> ⚠️ **`submitOrder` já devolve `{ orderId, status }`** mas o código atual **descarta** o retorno
> (`await api.submitOrder(cartId);`). A Fase 7 captura: `const order = await api.submitOrder(...)`
> → `patch({ orderId: order.orderId })`. É esse o mecanismo do campo de estado `orderId` novo.

> **[mock]** A ordem exata de party-antes-de-autorizar diverge do dossiê (lá autoriza antes de
> criar o cliente). Reusar party/customer idempotentes é a nossa simplificação já existente;
> documentar como dívida, não bloquear.

> ⚠️ **TESTES QUE QUEBRAM (faltavam no plano)**: `src/lib/onboarding-submit.test.ts` afirma a
> sequência exata `[createParty, createCustomer, createCart, addPlan, addSim, submitOrder]` e
> `addItem` chamado 2×; `src/lib/onboarding-guard.test.ts` (novos gates sim/delivery mudam as
> saídas); `src/services/charging.functions.test.ts` (saldo pós-onboarding). Atualizar junto.

---

## 6. Customer 360 / My plan — `src/services/customer360-rules.ts`

**[fiel]** O add-on/plano/SIM já aparecem como `Product` no installed base (Fase 6). O eSIM vs
físico vira um detalhe do `Product kind:"sim"` — campo `simType` no Product para My plan mostrar
"eSIM" vs "Physical SIM". ⚠️ **Subido para should-fix** (era "baixa prioridade"): é o único lugar
que **prova** que a bifurcação do `/sim` teve efeito; para uma demo telecom, é barato e vale.
(Cuidado: `Offer.kind` = `"plan"|"addon"` e `Product.kind` = `"plan"|"add-on"|"sim"` são uniões
DIFERENTES e o `model.ts` avisa para não unificar — o `simType` no Product é campo à parte.)

**[fiel]** O saldo após onboarding deixa de ser `null`: agora há crédito da 1ª recarga (via
`topUp`), então My plan mostra o saldo real. Isso muda o teste de "saldo null → no balance yet"
no success — passa a mostrar o crédito.

---

## 7. Telas + i18n

**[fiel] Novas telas**: `/sim` (2 opções radio), `/delivery` (form de endereço com autocomplete
tokens `address-line1`, `address-level2`, `postal-code`…), e **o bloco de pagamento em `/review`**
(campos de cartão mock + consentimento + "Place order", nunca "Pay").

**[fiel] eSIM no success**: tela de instalação (código `LPA:…`, QR, "copiar código", três
caminhos) quando `simType === "esim"`.

**[fiel] Palavras de dinheiro** (regras rígidas do dossiê): "Authorized today", "We authorize
{total} today. We charge it when your SIM ships / your eSIM is ready.", "added when your line is
active". Proibido "hold"/"free"/"soon". Botão "Place order".

⚠️ **B1 — o dinheiro no `/success` é uma LINHA DO TEMPO DE MARCOS, não três carimbos de "hoje".**
Mesmo que o mock capture logo após o submit, o rótulo é o do marco: "Authorized ✓" ·
"Charged when your SIM ships" (físico) / "Charged when your eSIM is ready" (eSIM) ·
"Added when your line is active". Carimbar "Charged today" no mesmo instante que "Authorized today"
ensinaria que são sinônimos e quebra o modelo pré-pago para uma plateia telecom. O estado
`captured` do mock é representado como **pendente de marco**, não cobrança consumada.

⚠️ **B3 — cópia que impede a leitura dupla**: `/review` e `/success` dizem explicitamente
*"What you authorize today becomes your first balance."* (um valor, um propósito).

⚠️ **B2 — toda linha de dinheiro declara sua natureza**: "Plan · first top-up", "Authorized today
· {total}". A tela **não soma** — lê o `priceMinor` do plano via helper.

**i18n**: chaves **novas** en + de-AT (`onboarding.sim.*`, `onboarding.delivery.*`,
`onboarding.payment.*`, `onboarding.esim.*`), paridade obrigatória. ⚠️ **E chaves EDITADAS** (o
plano só listava novas): `onboarding.review.confirm` ("Confirm and activate" → **"Place order"**);
`balanceEmpty` (×2 — há duas, em namespaces diferentes) e `balanceNote` ("You start with no
balance") passam a ser **condicionais ao saldo** (após o `topUp`, o saldo deixa de ser null).

**[fiel] eSIM no `/success` — QUATRO estados** (achado B4; o plano só cobria o feliz): `ready`
(instalar: código/QR/3 caminhos) · `requested` ("preparando, volte em instantes") · `failed`
(reenviar perfil) · `expired` (novo perfil). Usar `result-head` + `state-block` do DESIGN.md.

**[should-fix] Recusa de cartão** é **erro no campo do cartão** em `/review` ("That card was
declined. Try another card."), **distinto** do erro terminal de ativação do rodapé — senão a
pessoa reaperta "Place order" com o mesmo `4000` e recusa de novo (S3).

**[should-fix] `addressOutsideDeliveryArea`** é estado recuperável em `/delivery` ("We don't
deliver to this address yet. Try another address."), não erro terminal.

**[should-fix] Um só botão primário** por tela: "Place order" **substitui** o "Confirm and
activate" do `WizardNav` em `/review` — não cria um segundo primário.

---

## 8. Resumo de arquivos tocados

| Arquivo | Mudança | fiel/mock |
|---|---|---|
| `src/services/model.ts` | +simTypes, SimChoice, DeliveryAddress, EsimProfile, PaymentResult, FirstTopUp states | fiel |
| `src/lib/onboarding-context.ts` | +simType, deliveryAddress, addressId, orderId, authorizationRef; ONBOARDING_STEPS +sim +delivery | fiel |
| `src/lib/onboarding-persistence.ts` | init + sanitização dos campos novos | fiel |
| `src/lib/onboarding-guard.ts` | gates de sim e delivery; M derivado | fiel |
| `src/services/driver-config.ts` | SeamName +payment +logistics | fiel |
| `src/services/payment/*` (novo) | authorize/capture/void/getPayment + mock + http-stub | fiel/mock |
| `src/services/logistics/*` (novo) | createAddress (TMF673) + mock + http-stub | fiel/mock |
| `src/services/resource/*` | +requestEsimProfile/getEsimProfile | fiel/mock |
| `src/services/api.ts` | expõe as novas ops | fiel |
| `src/schemas/*` | zod das entradas novas | fiel |
| `src/lib/onboarding-submit.ts` | authorize→(createAddress)→cart→submit→capture→credit; SubmitStep+ | fiel/mock |
| `src/routes/onboarding/{sim,delivery}.tsx` (novo) + review.tsx + success.tsx | telas | fiel |
| `src/routes/onboarding.tsx` | StepGuard reconhece sim/delivery | fiel |
| `src/components/onboarding/wizard-page.tsx` | ⚠️ passos como prop runtime (não const) | fiel |
| `src/components/onboarding/onboarding-stepper.tsx` | ⚠️ passos como prop runtime (não const) | fiel |
| `src/locales/{en,de-AT}.json` | chaves novas **+ editadas** (review.confirm, balanceEmpty ×2, balanceNote) | fiel |
| `src/lib/onboarding-submit.test.ts` | ⚠️ sequência de passos + addItem count mudam | fiel |
| `src/lib/onboarding-guard.test.ts` | ⚠️ gates sim/delivery mudam saídas | fiel |
| `src/services/charging.functions.test.ts` | ⚠️ saldo pós-onboarding | fiel |

---

## 9. Dívidas conscientes (registrar na spec, não implementar)

- Journey Mesh / BPMN / Composite API / BFF reais; registro transacional; trava atômica.
- 3-D Secure real, PSP real, tokenização por campos hospedados.
- Identidade por provedor (Catar) e documento digitado (México) — Fase 7 é caso-base EUA.
- Reautorização MIT; polling assíncrono de dias; webhooks PSP/SM-DP+/transportadora.
- Marco de captura real (hoje simulado pós-submit); passo de valor livre da 1ª recarga.
- Voucher como meio de pagamento alternativo.
- Retomada entre dispositivos / rascunho na operadora.
