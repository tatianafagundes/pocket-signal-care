# Fase 7 — revisão do PLANO (SIM/eSIM + endereço + payment em três tempos)

> Revisão de **plano**, não de código. Fonte de verdade: `docs/contracts/onboarding-prepago-dossie.md`.
> Plano revisado: `docs/design/2025-02-16-fase7-impacto-sim-endereco-pagamento.md`.
> Régua de UX: `design/DESIGN.md` (encontrado em `design/DESIGN.md`).
> Fluxo atual lido no código: `src/routes/onboarding/{plan,addons,number,account,review,success}.tsx`,
> `src/lib/onboarding-submit.ts`, `src/lib/onboarding-context.ts`.
> Sem link de Figma → paridade não avaliada. Sem app rodando → nenhuma verificação visual; isto é leitura de plano + código.

## Promessa da tela (da Fase 7 como experiência)
"Escolha físico ou eSIM, diga para onde mandar (se físico), e confirme um pedido onde o dinheiro é **reservado hoje** e só **cobrado** quando o SIM sai / o eSIM fica pronto — e **creditado** como saldo quando a linha ativa."

## O que está resolvido (não mexer)
- **Modelo de dinheiro ancorado no contrato certo.** O §0 corrige a tese antiga ("pré-pago cobra no top-up") e amarra authorize→capture→credit ao HLD §3. A decisão central está correta e é a espinha da fase.
- **Disciplina de segredo mantida.** Cartão/CVV nunca entram em estado nem em sessionStorage; só `methodLabel` persiste (§2). É a mesma regra do password já no código (`account.tsx` passa o password ao seam e só `email` vai ao contexto). Coerente.
- **Seams exaustivos.** Adicionar `payment` e `logistics` ao `SeamName` com `ENV_KEY` e manter eSIM dentro de `resource` segue o padrão existente; o aviso de typecheck exaustivo é real e está respeitado.
- **Guard como gate real, derivado de `ONBOARDING_STEPS`.** Manter `ORDER` derivado dos steps (sem drift) e `/sim`/`/delivery` como gates (não opcionais como addons) está certo — bate com o `firstIncompleteStep` atual.
- **Palavras de dinheiro nomeadas.** "Authorized today", "added when your line is active", "Place order", proibição de hold/free/soon (§7) refletem o dossiê §5 literalmente.

---

## Achados

### Bloqueia entrega

- **B1 · `/review` não tem estado para "número velho exibido como novo" na captura — e o plano captura logo após o submit.**
  Frase: *o cliente, ao ver "Charged" aparecer imediatamente depois de "Place order", conclui que foi cobrado na hora — e o modelo pré-pago inteiro (reserva ≠ cobrança) deixa de ser legível.* O plano (§0 [mock]) faz `capture` "logo após o submit". Então na prática as três palavras — authorize, charge, credit — acontecem em segundos, na mesma tela de sucesso. A regra do dossiê ("cada frase de dinheiro só aparece com o campo que a prova", §5) é respeitada no dado, mas a **sequência temporal que dá sentido às três palavras colapsa**. Num produto que faz preço, exibir "Charged today" no mesmo instante que "Authorized today" ensina que são sinônimos. → **Decidir agora:** em `/success`, mostrar o dinheiro como **linha do tempo com estados** (Authorized ✓ · Charged quando o SIM despacha / eSIM pronto · Added quando a linha ativa), e **não** carimbar "Charged" com a data de hoje só porque o mock capturou. Se o mock captura na hora, o rótulo ainda deve ser o do marco ("Charged when your SIM ships"), com o valor em estado `captured` representado como *pendente de marco*, não como cobrança consumada. Sem essa decisão, o mock mente sobre o produto para uma plateia telecom.

- **B2 · O total de `/review` não diz "sobre que prazo / do que é" o valor autorizado.**
  Frase: *o cliente, ao ver um total no rodapé de `/review`, não sabe se aquilo é a 1ª recarga, a mensalidade, ou plano + add-ons + SIM — e aprova sem saber o que será reservado.* O `review.tsx` atual tem `balanceNote` ("You start with no balance") mas **nenhuma linha de total/autorização** — o bloco de pagamento é novo. O plano (§7) promete as frases de dinheiro mas **não decide o que o total soma**: plano? plano + add-ons? SIM tem preço? A regra §5 do dossiê é "a tela nunca soma — total vem da cotação/recibo". → **Decidir agora:** de onde vem o número autorizado (há cotação/`quote` no mock, ou o plano monta o valor na mão?), e cada valor monetário em `/review` precisa declarar sua natureza ("Plan · first top-up", "Add-ons", "Authorized today {total}"). Hoje o plano deixa isso implícito e o §6b do meu próprio checklist (todo número de dinheiro diz o que é) está violado.

- **B3 · "firstTopUp = preço do plano" dobra o significado de um número e pode cobrar/creditar o valor errado.**
  Frase: *o cliente, cujo plano custa €X/mês, vê €X "added when your line is active" e conclui que ganhou um mês grátis de saldo — ou, pior, é creditado €X de saldo E assinou um plano de €X, sem saber se pagou uma coisa ou duas.* O dossiê (HLD §1) diz "o plano É pago pela 1ª recarga", então dobrar faz sentido **se** a tela deixar claro que **é o mesmo dinheiro**: você autoriza €X, esse €X vira saldo, e o saldo paga o plano. O plano (§3) decide folding mas **não decide a frase que impede a leitura dupla**. → **Decidir agora:** a cópia de `/review` e `/success` precisa dizer explicitamente "o que você autoriza hoje vira o seu primeiro saldo" — um valor, um propósito. Sem isso, folding economiza um passo e compra uma confusão de dinheiro, que é o erro mais caro aqui.

- **B4 · Estados do eSIM install incompletos: falta "not-installed-yet" e "expired" como telas, e falta o caminho de falha.**
  Frase: *o cliente de eSIM, cujo perfil ainda não baixou (ou expirou em ~5 dias), abre `/success` e não encontra o que fazer — ou vê um QR de um perfil `failed` e conclui que a linha não ativou.* O dossiê (§2) lista `state ∈ requested | ready | downloaded | installed | deleted | expired | failed` e o plano (§1) copia esses estados no `EsimProfile`, mas o §7 ("eSIM no success") só descreve o caminho feliz (código/QR/três caminhos). A pergunta 3 pede ready / not-installed-yet / installed / failed — o plano cobre **ready** e implícito **installed**, mas **não decide a tela de**: perfil ainda `requested` (gerando), `failed` (precisa reenviar), `expired` (precisa novo perfil). → **Decidir agora:** as quatro telas de estado do eSIM em `/success`, cada uma com uma ação (ready: instalar; requested: "preparando, volte em instantes" + como voltar; failed/expired: reenviar perfil). `DESIGN.md` já tem `result-head` (success/pending/error) e `state-block` (erro com uma ação) — use-os; não invente.

### Vale corrigir

- **S1 · Ordem: `/sim` logo após `/plan` é defensável, mas `/delivery` depois de `/account` está certo e o plano concorda — explicitar por quê, porque diverge do dossiê.**
  O dossiê põe endereço depois de account; o plano também (`… account → delivery(se physical) → review`). Então **não há divergência de ordem de endereço** — a pergunta do enunciado assume uma divergência que o plano não tem. O que diverge é `firstTopUp` como passo (dossiê) vs folded (plano) — ver B3. Sobre `/sim` após `/plan`: é sólido porque o tipo de SIM **condiciona `/delivery`** e porque `Offer.simTypes` (§1) pode restringir por oferta — saber o SIM cedo evita oferecer entrega de uma oferta eSIM-only. **Mas**: `/sim` logo após `/plan` empurra uma decisão técnica (físico vs eSIM) antes de o cliente ter investido no fluxo. Alternativa a considerar e registrar: `/sim` logo antes de `/delivery` (depois de account), para agrupar "logística" junto. Recomendo manter após `/plan` **se** a oferta eSIM-only existir (aí é gate de catálogo), senão mover para junto da entrega. Decisão, não gosto — registre a razão.

- **S2 · Reautorização / validade de ~5 dias: o plano trata como dívida, mas `/success` com captura imediata esconde que a autorização poderia expirar.**
  Como o mock captura na hora, o timer de 5 dias (dossiê §4) nunca dispara — ok como mock. Mas se B1 for resolvido mostrando o dinheiro como linha do tempo com "Charged when your SIM ships", um cliente atento pergunta "e se demorar?". Não precisa implementar reauth; **precisa** de uma frase honesta ("we hold your authorization until your SIM ships") — e **não** pode usar "hold" (proibido). Resolver a redação junto de B1.

- **S3 · `/review` como lugar do cartão: o plano coloca o bloco de pagamento em `/review`, mas não decide o estado de "cartão recusado" na própria tela.**
  O plano (§5) diz autoriza **antes** de criar a ordem e recusa → erro terminal. O `review.tsx` atual já tem um padrão de `terminalError` com o rodapé como único retry. Mas cartão recusado (`4000…`) **não é** o mesmo que falha de seam na ativação: o cliente precisa **trocar o cartão**, não só "tentar de novo". → Decidir: recusa de autorização mostra erro **no bloco de cartão** (campo), não no `terminalError` genérico do rodapé. Senão o cliente aperta "Place order" de novo com o mesmo 4000 e recusa de novo.

- **S4 · My plan / Customer 360: "eSIM vs físico" marcado como baixa prioridade — mas é o único lugar que prova que a escolha do `/sim` teve efeito.**
  O plano (§6) deixa `simType` no Product como opcional "baixa prioridade". Para uma demo telecom, My plan mostrando "eSIM" vs "Physical SIM" é barato e é a prova de que a bifurcação é real. Subir para should-fix.

- **S5 · Stepper "Step N of M" derivado: o plano manda tornar M derivado, mas não decide o que o cliente vê quando M muda no meio.**
  Hoje `ONBOARDING_WORKING_STEP_COUNT` é fixo (6). Com `/sim` e `/delivery` condicionais, escolher eSIM em `/sim` **remove** `/delivery` e M cai de (digamos) 8 para 7 **depois** de o cliente já ter visto "Step 3 of 8". O plano cita "recalcular M" mas não a experiência do número que anda para trás. → Decidir: ou M só conta passos já garantidos, ou o stepper não mostra M até o SIM estar escolhido. Pequeno, mas é um número que muda na cara do cliente.

### Refinamento (preferência declarada)

- **R1 · (preferência) `/sim` com duas option-rows:** o `DESIGN.md` tem `option-row` (radio + `accent-tint` wash). Sugiro cada opção carregar uma linha de consequência ("eSIM — nothing to ship, install on this phone" / "Physical SIM — delivered to your address"), para a escolha ser informada. Preferência, não bloqueio.
- **R2 · (preferência) Copiar o `LPA:` com feedback 4.1.3:** "copiar código" precisa anunciar "Copied" via status message — mas isso é detalhe de implementação da tela, registro aqui para não esquecer.

---

## Acessibilidade — WCAG 2.2 AA (do que o plano decide)
| Critério | O que o plano arrisca | Correção | Aparece num ACR? |
|---|---|---|---|
| 4.1.3 Status Messages | "Authorized/Charged/Added" mudam sem troca de tela; captura/crédito atualizam valor | cada transição de dinheiro anunciada por `role="status"` (o `review.tsx` já faz isso no submit — estender ao bloco de pagamento e ao success) | Sim |
| 1.3.5 Identify Input Purpose | form de endereço e cartão | plano já cita autocomplete `address-line1`/`postal-code`; adicionar `cc-*` ao cartão mock (`cc-number`, `cc-exp`, `cc-csc`) | Sim |
| 3.3.1 / 3.3.3 Error | cartão recusado, endereço fora de área | erro associado ao campo + sugestão ("try another card"); ver S3 | Sim |
| 1.4.11 Non-text contrast | QR do eSIM | QR é gráfico; garantir ≥3:1 e **não** ser o único caminho (o código `LPA:` em texto é a alternativa — bom) | Sim |
| 2.5.8 Target size | "copiar código", radios de `/sim` | 24×24 mínimo; o DESIGN.md já pede `tap` 44 — ok | — |

Contexto Ericsson: endereço + pagamento + eSIM são exatamente as telas que uma operadora audita em VPAT/ACR. 4.1.3 nas transições de dinheiro é o achado que mais pesa aqui — sobe de prioridade.

## Estados faltando
- eSIM: `requested` (gerando), `failed`, `expired` em `/success` (B4).
- Pagamento: **autorização recusada** como estado de campo em `/review` (S3), distinto de falha de ativação.
- Pagamento: **autorização expirada** antes da captura — dívida ok, mas precisa de frase honesta (S2).
- Endereço: `addressOutsideDeliveryArea` — o plano cita o erro de negócio no seam (§4), mas **não decide a tela**: o cliente digitou um endereço válido e a área não atende. Precisa de estado recuperável em `/delivery`.
- Concorrência (duas pessoas): fora de escopo do onboarding de linha nova (um cliente, uma sessão) — não é achado aqui.

## Carga — o que perguntei e o que ficou sem resposta
- **Quantos endereços / opções de entrega?** `listDeliveryOptions` é citado como opcional — se entrar, quantas opções no pior caso? Provável baixo; não bloqueia.
- **ICCID 19–20 dígitos** (SIM físico, ativação): não é da Fase 7 (ativação é pós-entrega), mas o plano reusa `resource.validateSim` — confirmar que a ativação por ICCID **não** está sendo empurrada para `/success` do onboarding (seria outra tela). Pergunta aberta.
- Ponto de virada de lista: nenhuma tela da Fase 7 é lista longa. Carga não é o risco desta fase; **dinheiro e estados são**.

## Papéis
Um só: o futuro cliente, não autenticado, numa sessão. Sem papel de operador/admin nestas telas. `DESIGN.md` confirma telas pré-login sem tab bar. Sem achado de papel.

## Aderência ao sistema
- **Botão primário:** "Place order" deve ser o `button-primary` (brand accent, pill, 52px, um por tela). Em `/review` já há o rodapé `WizardNav` — garantir que "Place order" não crie um **segundo** botão primário na mesma tela que o "Confirm and activate" atual. O plano troca a semântica do rodapé para pagamento; decidir se é um botão só.
- **Bloco de pagamento:** cartão + consentimento devem usar `card` (sem sombra, hairline) e `surface-tint`/`surface-sand` para o painel de nota — nunca como botão/header (regra do DESIGN.md).
- **Nada de "free/soon/hold":** coerente com o dossiê e com o DESIGN.md ("status é cor + palavra").
- **Um termo por conceito:** plano usa "Top up" (tab) e "first top-up" (recibo) — consistente. Vigiar "charge" (verbo de cobrança) vs "top up" (crédito): são momentos diferentes, não sinônimos.

## Escrita — antes → depois
Strings de produto em inglês (en-US), sentence case.

| Onde | Está (en, proposto no plano) | Proposta (en) | Por quê |
|---|---|---|---|
| /review total | (sem linha de total decidida) | `Authorized today · {total}` | B2: todo valor declara sua natureza |
| /review nota | — | `What you authorize today becomes your first balance.` | B3: um valor, um propósito |
| /success dinheiro | "added when your line is active" | `Added when your line is active · {amount}` | §5 dossiê: frase só com o campo que a prova |
| /success charge | "We charge it when your SIM ships" | `Charged when your SIM ships` (físico) / `Charged when your eSIM is ready` (eSIM) | B1: rótulo é o marco, não "hoje" |
| /sim opção eSIM | "eSIM" | `eSIM — nothing to ship` | R1: escolha informada |
| /delivery erro | (erro de seam) | `We don't deliver to this address yet. Try another address.` | estado `addressOutsideDeliveryArea` recuperável |
| cartão recusado | (terminalError genérico) | `That card was declined. Try another card.` | S3: ação é trocar cartão |

Termos a confirmar antes de entrar no glossário: "first top-up" (é o preço do plano? confirmar com Tatiana antes de gravar definição). Não gravo definição não confirmada.

## Build de demo
Não é uma build de demo — é o plano do produto real em mock. As simplificações (§9) são dívida honesta **exceto** onde colapsam o sentido do modelo (B1). A pergunta 4 do enunciado: das quatro simplificações, **três são honestas e seguras** (card token mock 4242/4000, sem 3-DS, caso-base EUA sem identidade) — são infraestrutura, não enganam a plateia sobre *o modelo*. **A quarta (captura logo após submit) é a única que engana**, porque transforma três momentos temporais em um instante e faz "Charged" parecer cobrança imediata. Não precisa virar async real; precisa que a **UI represente os três estados como marcos**, não como três carimbos de "hoje". Isso é B1.

## Preciso saber antes
- **De onde vem o valor autorizado?** Existe `quote`/cotação no mock, ou `/review` soma na mão? Suspende B2 e a linha de total. (DESIGN.md e dossiê §5 dizem "a tela nunca soma" — se não há cotação, isso é uma decisão de arquitetura, não de cópia.)
- **"first top-up = preço do plano" é literal (mesmo dinheiro) ou são dois valores?** Suspende B3. Se forem dois, o folding está errado.
- **Existe oferta eSIM-only no catálogo do mock?** Suspende S1 (define se `/sim` é gate de catálogo ou pode mover para junto de `/delivery`).
- **Ativação por ICCID entra em `/success` do onboarding ou é pós-entrega, fora desta fase?** Suspende o item de carga do ICCID.

## Limites desta revisão
- Sem app rodando e sem Figma: **nenhuma verificação visual**. Isto é leitura do plano + código atual (`review.tsx`, `success.tsx`, `onboarding-submit.ts`, `onboarding-context.ts`, `DESIGN.md`). Leitura de plano não é revisão de tela renderizada.
- Não li `src/services/model.ts`, `onboarding-guard.ts` nem os seams — avaliei as afirmações do plano sobre eles pela coerência com o dossiê e com os quatro arquivos de rota que li; não confirmei as assinaturas de tipo.
- Paridade Figma ↔ código: não avaliada (sem link).
- `firstTopUp` como passo (dossiê HLD §2.3) vs folded (plano): tratei como decisão de produto em aberto (B3 + pergunta), não como regressão — não há decisão registrada anterior dizendo que deve ser passo próprio *neste app*.
