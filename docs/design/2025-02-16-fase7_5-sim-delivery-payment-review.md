# Fase 7.5 — revisão das telas (SIM/eSIM · endereço · pagamento em três tempos · success)

> Revisão de **código-fonte**, não de tela renderizada. Não rodei o app e não há link de Figma →
> **nenhuma verificação visual**; paridade Figma↔código não avaliada. É leitura do source + i18n.
> Régua de UX: `design/DESIGN.md` (encontrado em `design/DESIGN.md` — confirmado como a régua deste
> projeto). Dossiê de verdade do dinheiro: `docs/contracts/onboarding-prepago-dossie.md` (citado pelas
> duas rodadas anteriores; não reli nesta passada — herdo as decisões já registradas).
> Rodadas anteriores lidas e usadas: `2025-02-16-fase7-plan-review.md` (B1–B4, S1–S5) e
> `2025-02-16-fase7-impacto-sim-endereco-pagamento.md` (decisões da dona confirmadas).
> Arquivos revisados: `src/routes/onboarding/{sim,delivery,review,success}.tsx`, `src/routes/my-plan.tsx`,
> `src/lib/onboarding-submit.ts`, `src/locales/{en,de-AT}.json`.

## Promessa da tela (Fase 7.5 como experiência)
"Escolha físico ou eSIM; diga para onde enviar (só físico); confirme um pedido onde o dinheiro é
**autorizado hoje**, **cobrado** quando o SIM despacha / o eSIM fica pronto, e **creditado** como
saldo quando a linha ativa — e veja isso como uma linha do tempo, não como três cobranças de hoje."

## O que está resolvido (não mexer)

Esta fase **cumpre as quatro promessas** que a rodada de plano deixou em aberto. Nomeando, porque é
a espinha e não deve regredir:

- **B1 cumprido — o dinheiro no `/success` é linha do tempo de marcos, não três carimbos de "hoje".**
  `MoneyTimeline` (success.tsx) mostra "Authorized" como DONE (✓) e "Charged when your SIM ships / your
  eSIM is ready" + "Added when your line is active" como marcos futuros, cada um com um detalhe
  ("You're not charged until then."). Nenhuma das três linhas usa "today". É exatamente o que B1 pediu.
- **B2 cumprido — toda linha de dinheiro declara sua natureza e a tela não soma.** `/review` tem
  "Plan · first top-up" e "Authorized today", ambos lendo `offer.priceMinor` via `formatPrice`; não há
  soma na UI (é o mesmo número rotulado duas vezes, que é o ponto: um valor, um propósito). O backstop de
  €0 existe em dois lugares (o `complete` gate e o `offer.priceMinor <= 0` em `confirm()`, mais o
  `planPriceMinor <= 0` em `runOnboardingSubmit`) — nenhum caller ativa linha por €0 em silêncio.
- **B3 cumprido — a cópia impede a leitura dupla.** `authorizeNote`: "What you authorize today becomes
  your first balance. We only charge it when your plan is ready." E no success, `addedDetail`: "Your
  first top-up becomes your balance." Um valor, um propósito, dito explicitamente.
- **B4 cumprido — quatro estados do eSIM em `/success`.** `EsimSection` trata `ready` (código +
  três caminhos), `requested`, `failed`, `expired`, mais `isPending` (skeleton), `isError` (lido como
  failed) e `esimProfileId == null`. Usa `result`-ish shells com heading. Mais completo que o plano pedia.
- **S3 cumprido — recusa de cartão é erro de CAMPO, recuperável.** `confirm()` separa
  `err.code === "payment.cardDeclined"` → `setCardError` (ao lado do input, com `aria-describedby`/
  `aria-invalid`), de todo o resto → `terminalError` no topo. A pessoa troca o cartão e reenvia; não
  reaperta "Place order" contra o mesmo erro terminal. Exatamente o S3.
- **S4 cumprido — My plan prova a bifurcação.** `my-plan.tsx` mostra "eSIM" / "Physical SIM" sob o
  produto `kind === "sim"` com `simType`. Barato e é a prova de que `/sim` teve efeito.
- **Disciplina de segredo mantida.** `tokenizeCardMock` roda dentro de `confirm()`, o PAN nunca vai a
  estado/sessionStorage, só o token opaco passa adiante. Idempotência de dinheiro (`authorizationRef`,
  `orderId`, `captured`, `credited`) persistida e reusada no retry — "Don't pay again" honrado.
- **4.1.3 nas transições de dinheiro.** `/review` tem `<p role="status">` que anuncia cada `busyStep`
  (authorize → … → finalizing) com chave própria. É o achado que mais pesa num ACR e está feito.
- **Sem "hold"/"free"/"soon"** em nenhuma tela de dinheiro (en e de-AT). Confirmado por leitura.
- **Links em `accent-ink`** (o "Change" em review usa `text-accent-ink`, não a variante shadcn que
  cairia no cyan #0096c5 ~3.3:1). Aderente à régua.

---

## Achados

### Bloqueia entrega

- **B1-regressão · `/success` promete três caminhos de instalação de eSIM, mas a tela entrega um só —
  e dois deles apontam para artefatos que não existem.**
  Frase (plateia + usuário): *o cliente de eSIM, ao ler "1. Tap the install link we emailed you" e
  "2. Scan the QR code from another device", procura o link e o QR — e não há nenhum dos dois na tela;
  só o código de ativação em texto.* `EsimSection` (success.tsx, ramo `ready`) renderiza a lista dos três
  caminhos (`pathUniversal`, `pathQr`, `pathManual`) e, embaixo, **apenas** `profile.activationCode` num
  `<code>`. Não há QR (nenhum componente de QR é importado — só `Check` de lucide) e não há link de
  instalação clicável; o texto diz "we emailed you", mas nada nesta tela confirma que um e-mail saiu.
  Dos três caminhos anunciados, **dois são promessas que a UI não cumpre**. Num produto que faz preço e
  numa demo telecom, prometer "scan the QR" sem QR é o tipo de coisa que a plateia desconta na hora.
  → **Decidir agora, uma das duas:** (a) renderizar de fato o QR (o dossiê previa `installUrl`/QR a
  partir do `LPA:` — gerar o QR a partir de `activationCode`, garantindo ≥3:1 não-texto, WCAG 1.4.11) e
  um link universal real; ou (b) reescrever a cópia para prometer só o que a tela entrega — o código de
  ativação manual — e mover "link por e-mail / QR" para uma frase honesta ("we also emailed you a link"
  **só se** o e-mail realmente sai no mock). Não deixe a lista numerada de três quando a tela tem um.
  Herdo de R2 (rodada anterior) a nota de que "copiar código" deveria anunciar "Copied" (4.1.3) — hoje o
  código é texto selecionável sem botão de copiar; aceitável como alternativa de texto (é o caminho 3),
  mas se virar o **único** caminho, um affordance de copiar com feedback passa de refinamento a esperado.

### Vale corrigir

- **S1 · O estado DONE vs UPCOMING da linha do tempo de dinheiro é transmitido só visualmente.**
  Frase: *quem usa leitor de tela, ao percorrer a linha do tempo, não ouve que "Authorized" está
  concluído e que "Charged"/"Added" ainda vão acontecer — o único sinal de "feito" é o círculo preenchido
  com o check, e esse ícone é `aria-hidden="true"`.* `TimelineRow` marca `done` só pela classe do círculo
  (`bg-accent-ink` + `<Check>`), e o check é escondido do AT. O rótulo "Authorized" por si não diz
  "concluído"; "Charged when your SIM ships" diz *quando*, o que ajuda, mas o contraste done/upcoming some
  para quem não vê. Régua: WCAG 1.3.1 / 1.4.1 (não comunicar estado só por cor/ícone) e o próprio
  DESIGN.md ("status é cor + palavra"). → Adicionar texto não-visual do estado: um `<span class="sr-only">`
  por linha ("Done" / "Upcoming", via chave i18n), ou pôr a palavra de estado visível no detalhe. Barato,
  e é exatamente o tipo de item que um ACR pega.

- **S2 · `/review` tem DOIS avisos de "incompleto" dizendo quase a mesma coisa, um deles como `alert`.**
  Frase: *o cliente que ainda não preencheu o cartão vê, ao mesmo tempo, o parágrafo "Enter your card and
  authorize the payment to place your order." (`role="alert"`) e um botão "Place order" desabilitado com
  o hint — dois textos para a mesma condição, e o `role="alert"` dispara no AT a cada render em que
  `!complete`.* O `<p role="alert">` (review.tsx, `onboarding.review.incomplete`) e o `disabledHint` do
  WizardNav cobrem a mesma coisa. `alert` é assertivo: anunciar "incompleto" de forma assertiva enquanto a
  pessoa ainda está digitando o cartão é ruído, não ajuda. → Manter um só sinal. Sugiro: dropar o
  `role="alert"` (ou trocar por `role="status"`/sem role) e deixar o hint do botão fazer o trabalho; ou,
  se o parágrafo fica, que não seja `alert`. Decisão de qual sobra é sua; os dois assertivos não.

- **S3 · Cópia da recusa de cartão (seamError.payment.cardDeclined) diz "Check the number" — mas a tela
  não valida número de cartão, então a orientação pode mandar o cliente a um beco.**
  Frase: *o cliente cujo cartão `4000…` recusa lê "Check the number or try a different card", confere o
  número (que está "certo" — é o número mock de recusa determinística), não acha erro, e não entende que a
  ação é trocar o cartão.* No mock, `4000` recusa por design; "check the number" sugere erro de digitação
  que não existe. A proposta da rodada anterior era mais limpa: "That card was declined. Try another card."
  → Alinhar a cópia à ação real (trocar cartão), en e de-AT. Não é bloqueio porque o caminho (campo,
  recuperável) está certo; é a palavra que confunde.

- **S4 · `/sim` "Continue" desabilitado é um botão cinza permanente até escolher — ok — mas o hint só
  aparece no WizardNav; confirmar que não vira botão morto sem explicação.**
  Isso o código já trata (`disabledHint` "Choose a SIM type to continue."), então **não é achado** se o
  WizardNav mostra o hint de forma acessível. Registro só para o `implement` confirmar que o
  `disabledHint` é lido por AT (ex.: `aria-describedby` no botão), não só visual. Suspenso até ver o
  WizardNav (não li o componente nesta passada — ver Limites).

### Refinamento (preferência declarada)

- **R1 · (preferência) Chaves órfãs no i18n depois da Fase 7.5.** `onboarding.review.confirm`
  ("Confirm and activate") não é mais usado (o botão é `placeOrder`); `onboarding.review.balanceNote`
  ("You start with no balance…") não é renderizado em review.tsx; `onboarding.success.balanceEmpty` não é
  usado pela nova `MoneyTimeline`. A paridade i18n (246/246) passa porque en e de-AT têm as mesmas chaves,
  mas são chaves mortas. Preferência: remover as três (en + de-AT) para o arquivo não acumular cópia que
  ninguém vê — ou, se o teste de paridade/cobertura exige que toda chave seja usada, isso vira should-fix.
  Não bloqueia; é higiene.

- **R2 · (preferência) `/delivery` — "State or region" + default "AT" é um par estranho para a Áustria.**
  O host é Drei Áustria; o default de `country` é "AT" (bom), mas o campo `region` "State or region" é
  vocabulário mais EUA que austríaco, e o caso-base declarado é EUA. Como a decisão registrada é
  "caso-base EUA, sem identidade", **não é incoerência** — é o escopo. Registro como preferência: quando
  Drei validar o de-AT, "Bundesland oder Region" (já está assim no de-AT, bom) e a ordem dos campos
  (PLZ antes de Ort é o hábito austríaco) merecem um olhar. Não mexer agora.

---

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| 1.3.1 / 1.4.1 Info/Use of color | success: linha do tempo comunica done/upcoming só pelo círculo+check (`aria-hidden`); sem palavra de estado para AT | `sr-only` "Done"/"Upcoming" por linha (S1) | Sim |
| 1.4.11 Non-text contrast | success eSIM: "scan the QR" prometido mas sem QR; se o QR entrar, garantir ≥3:1 | renderizar QR com contraste ≥3:1 ou remover a promessa (B1-regressão) | Sim |
| 4.1.3 Status messages | review: `role="alert"` em "incomplete" dispara assertivo durante digitação; "Copied" ausente no código do eSIM | tirar o `alert` (S2); feedback de copiar se virar único caminho | Sim |
| 3.3.3 Error suggestion | cardDeclined diz "check the number" sem haver validação de número (S3) | "Try another card." | Sim |
| 1.3.1 Radio cards (sim.tsx) | **OK** — `label htmlFor` + `RadioGroupItem id`, `aria-describedby` na descrição, estado via dot do radio (não só borda) | nada | — |
| 1.3.5 Identify input purpose | **OK** — delivery tem `autocomplete` address-*, review tem `cc-number`/`inputMode="numeric"` | nada | Sim |
| 3.3.1 Error identification | **OK** — card-number tem `aria-invalid` + `aria-describedby="card-error"`; delivery usa FormMessage do RHF | confirmar FormMessage associa via `aria-describedby` (shadcn faz) | Sim |
| 2.5.8 Target size | radios: alvo é a label-row `p-4` (≥44) — OK; checkbox de consentimento: label `type-caption` curta, confirmar linha clicável ≥24 | confirmar no WizardNav/Checkbox renderizado | — |
| 2.4.7 Focus visible | não verificável sem render; o foco é token do sistema (violet ring) | — | — |

Contexto Ericsson: endereço + pagamento + eSIM são as telas que uma operadora audita em VPAT/ACR contra
EN 301 549. Os três achados marcados "Sim" (linha do tempo não-visual, QR prometido-e-ausente, alert
assertivo) são resposta de RFP, não higiene — por isso S1 e B1-regressão sobem de prioridade.

## Estados faltando
- **eSIM `/success`:** `ready`, `requested`, `failed`, `expired`, pending (skeleton), erro de leitura e
  `id == null` — **todos presentes**. Nada faltando aqui (B4 fechado).
- **`/review` cartão recusado:** presente como erro de campo (S3 cumprido na mecânica; só a cópia).
- **`/review` falha terminal de ativação:** presente (`terminalError`, sem botão duplicado — um só retry
  no rodapé). Correto.
- **`/delivery` `addressOutsideDeliveryArea`:** presente e recuperável (SeamErrorNotice no topo do form,
  sem navegar para fora; a pessoa edita e reenvia). Correto.
- **`/sim` loading/error:** presente (skeleton + SeamErrorNotice com retry). Correto.
- **Autorização expirada antes da captura (S2 da rodada anterior):** como o mock captura
  sincronicamente, nunca dispara — dívida honesta, não é achado desta tela. A cópia do success
  ("You're not charged until then.") é honesta sem prometer prazo.

## Carga — o que perguntei e o que ficou sem resposta
- Nenhuma tela da Fase 7.5 é lista longa. `/sim` são 2 opções; `/delivery` 6 campos; `/review` um resumo
  fixo; `/success` uma linha do tempo de 3 + bloco eSIM. **Carga não é o risco desta fase** — dinheiro,
  estados e a promessa de 3-caminhos-do-eSIM são.
- `/review`: a ida ao servidor do submit tem anúncio de progresso por passo (bom). Acima de ~400 ms a
  pessoa vê o `busyStep` mudar; o número antigo não fica exibido como novo (não há recálculo de total na
  tela — o valor é o preço do plano, estável). Sem achado de "número velho como novo".

## Papéis
Um só: o futuro cliente, não autenticado, numa sessão (DESIGN.md confirma telas pré-login sem tab bar; o
success já loga a pessoa via `setSession`, transição correta). Sem papel de operador/admin. Sem achado.

## Aderência ao sistema
- **Um só botão primário por tela.** `/review` usa `placeOrder` no WizardNav (substituiu "Confirm and
  activate"); o "Change" é `variant="link"`, o success tem primário "Top up now" + ghost "Maybe later".
  Coerente com "um primário por tela".
- **Cartões sem sombra, hairline.** sim (`border-hairline bg-surface`), success (idem), eSIM shell (idem).
  O bloco de pagamento em review usa `border-t border-hairline` (separador, não card) — ok.
- **`accent-tint` como painel quieto.** O `<code>` do eSIM usa `bg-accent-tint text-accent-ink` — texto
  em accent-tint deveria ser `text-primary` pela regra do DESIGN.md ("Text on accent-tint is text-primary,
  never accent"). Aqui é um code block (dado técnico), e `accent-ink` em accent-tint tende a passar
  contraste, mas **é uma divergência da regra escrita** — confirmar o rácio #0073a0 sobre #e0f3fa com
  `tools/contrast.py`; se passar 4.5:1 é adaptação defensável (code block, não corpo), senão trocar para
  `text-primary`. Registro como divergência a confirmar, não bloqueio.
- **Seleção = accent.** sim.tsx: selecionado = `border-2 border-accent-ink` no card. A régua pede, para
  option-row, "accent-ink ring + dot + accent-tint wash". Aqui há borda 2px accent-ink + o dot do radio,
  mas **sem o wash accent-tint** do estado selecionado. Divergência leve do padrão `option-row`; não
  bloqueia (o dot do radio já dá o sinal redundante), mas se quiser bater com o DESIGN.md, adicionar o
  wash `has-[[data-state=checked]]:bg-accent-tint`.
- **Termos.** "Top up" consistente (tab, botão, "first top-up"). "Charge" (verbo de cobrança) vs "Top up"
  (crédito) mantidos distintos. "Authorized"/"Charged"/"Added" como os três momentos. Coerente.

## Escrita — antes → depois
Strings de produto em inglês (en-US), sentence case.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| `onboarding.seamError.payment.cardDeclined` | `Your card was declined. Check the number or try a different card.` | `Your card was declined. Try another card.` | S3: não há validação de número; "check the number" manda a um beco |
| `onboarding.success.esim.pathQr` + `pathUniversal` | `2. Scan the QR code…` / `1. Tap the install link we emailed you…` | ou renderizar QR+link de verdade, ou reescrever para o que a tela entrega (código manual) | B1-regressão: promessa sem artefato |
| success timeline (novo, i18n) | (sem palavra de estado) | add `onboarding.success.money.stateDone` = `Done`, `…stateUpcoming` = `Upcoming` para `sr-only` | S1: estado não-visual |
| `onboarding.review.incomplete` | mantido, mas sem `role="alert"` | (mesma string, sem alert) | S2: não anunciar assertivo durante digitação |

**de-AT — qualidade (spot-check das chaves novas):** natural, "du" informal consistente com o tom
existente, e **preserva a nuance do dinheiro**: "Heute autorisiert" (autoriza ≠ cobra), "Belastet, sobald
deine SIM verschickt wird" / "…eSIM bereit ist", "Gutgeschrieben, sobald deine Leitung aktiv ist",
"Was du heute autorisierst, wird dein erstes Guthaben. Wir belasten es erst, wenn dein Tarif bereit ist."
A distinção autorizar/belasten/gutschreiben está limpa e é a tradução correta dos três momentos.
"Straße und Hausnummer", "Bundesland oder Region", "Postleitzahl" são austríacos corretos. Sem "hold/
free/soon" nem seus equivalentes. **Uma nota:** se a cópia en de `pathQr`/`cardDeclined` mudar (acima),
o de-AT (`„2. Scann den QR-Code…"`, `"Prüf die Nummer oder versuch eine andere Karte."`) muda junto —
hoje o de-AT herda os mesmos dois problemas do en.

## Preciso saber antes
- **O mock de eSIM gera `installUrl`/QR, ou só `activationCode`?** O `model.ts` (pela rodada anterior)
  previa `installUrl?` e `LPA:1$smdp.mock$<match>`. Se o `installUrl` existe no `EsimProfile`, B1-regressão
  é "renderize o que já tem"; se não existe, é "reescreva a cópia para um caminho". Suspende a direção de
  B1-regressão (renderizar vs reescrever). (Não reli `model.ts`/`resource` nesta passada.)
- **O teste de paridade/cobertura i18n falha com chave não-usada?** Se sim, R1 (chaves órfãs) vira
  should-fix, não refinamento. Suspende a prioridade de R1.
- **O `WizardNav` expõe o `disabledHint` a AT (ex. `aria-describedby`)?** Suspende S4 e a linha de
  target-size do checkbox/nav na tabela (não li o componente).

## Limites desta revisão
- Sem app rodando e sem Figma: **nenhuma verificação visual**. Isto é leitura de source + i18n. Leitura de
  código não é revisão de tela renderizada — foco e rácios de contraste reais não foram vistos.
- Não li `src/components/onboarding/wizard-nav.tsx`, `wizard-page.tsx`, `onboarding-stepper.tsx`,
  `seam-error-notice.tsx`, nem `src/components/ui/{radio-group,checkbox,form,input}.tsx`. Avaliei o uso
  deles pelas props passadas nas telas; não confirmei o markup/ARIA que eles renderizam (daí S4 e parte da
  tabela de target-size ficarem suspensos).
- Não reli `src/services/model.ts` nem os seams (`payment`, `logistics`, `resource/esim`); herdo as
  assinaturas das rodadas anteriores e confirmei o fluxo em `onboarding-submit.ts`.
- A ferramenta de grep do ambiente não indexou os `.json` de locale nesta sessão (0 matches em buscas que
  o `read_file` depois confirmou existirem); li os blocos relevantes por leitura direta. Possível que algum
  uso de chave fora dos arquivos que li tenha escapado — a conclusão de "chave órfã" (R1) vale para os
  arquivos de rota lidos, não é varredura exaustiva do repo.
- Paridade Figma↔código: não avaliada (sem link).
- Dívida de mock declarada (captura síncrona, token mock, current customer = demo) **não** é achado — é
  dívida honesta registrada, fora do escopo de qualidade desta fase.
