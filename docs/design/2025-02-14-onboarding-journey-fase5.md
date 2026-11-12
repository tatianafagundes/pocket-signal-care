# Revisão de produto/UX — Onboarding Journey (Fase 5)

Revisão **pré-implementação** de spec (requirements.md / design.md / tasks.md da `onboarding-journey`),
contra o `DESIGN.md` ativo em `pocket-signal-care/design/` e a spec-mãe `whitelabel-mvno-onboarding`.
Sem app rodando e sem imagens: verifiquei **texto de spec**, não runtime nem render. Ver "Limites".

## Promessa da tela
"Em poucos passos claros, de visitante a cliente prepaid ativo: escolha um plano, crie a conta, pegue um número e confirme — sabendo onde você está e podendo voltar."

## O que está resolvido (não mexer)
- **Ordem oferta-primeiro bem fundamentada.** Ver plano antes de pedir dado é a decisão certa para conversão, e a reconciliação com a restrição de backend ("MSISDN no checkout, não na 1ª tela") está explícita e correta — resolve o conflito com a HLD (spec-mãe AC#2 pedia SIM-primeiro). design.md §Orquestração deixa isso claro.
- **Senha isolada num seam de auth, nunca no CPR.** Decisão arquitetural limpa (design.md §Novo seam, §Segurança). A senha vive só na memória do form + argumento do seam; não vai a localStorage, log, nem CPR. É o padrão production-ready correto.
- **Recommendation assist determinístico, rotulado como sugestão.** `confidence: 'suggested'` fixo, regra pura testável, sem LLM, com mesma assinatura do Next Best Offer futuro. Honestidade de rótulo e ponto de integração ao mesmo tempo. Não reabrir.
- **Matriz estado×tela existe como entregável** (Req 8, design.md §Matriz) e cobre o esqueleto certo com os componentes Fuon.
- **Catálogo opcional-aditivo** (campos `Offer` opcionais) não quebra os 56 testes nem o `composeCustomer360` e antecipa TMF620. Correto.

---

## Achados

### Bloqueia entrega

- **B1 — "Voltar e trocar de plano depois de reservar o número" não tem resposta, e produz cobrança/provisionamento errado silencioso.**
  Req 1.3 garante "voltar sem perder o que já foi preenchido" e Req 6.3 diz que o MSISDN reservado persiste. Mas o fluxo é Plan → … → Number → Review, e nada na spec diz o que acontece se, no `review` (ou via "voltar"), o usuário **troca o plano** depois do número já reservado. O `activation bundle` é `[{plano}, {sim-activation}]`; se o `selectedOfferId` muda e a reserva do MSISDN continua válida, o submit monta um bundle coerente — ok. **Mas o inverso é o perigo:** se o usuário volta ao `plan`, troca para um plano de outra categoria, e algum estado derivado (preço no review, motivo do assist, badge recommended) não for recomputado, o `review` mostra um resumo que **não corresponde ao que será provisionado**. É a frase "faz errado e não percebe": num fluxo que faz preço, o resumo de checkout exibindo um plano/preço desatualizado é o achado mais caro. → **Exigir na spec:** (a) trocar de plano invalida qualquer estado derivado do plano anterior (preço, assist reason) e recomputa o review; (b) o review é a fonte única de verdade montada no momento da renderização, nunca cacheada do passo anterior; (c) teste explícito "troca de plano após reserva → review e bundle refletem o novo plano". _Ref: Req 1.3, 6.3, 7.1; design.md §Orquestração._

- **B2 — Dois passos de conta (account + login) numa spec de onboarding, e a tela de login não tem lugar no wizard nem estados na matriz.**
  Req 4.6 e design.md (modelo, mock) exigem **uma tela de login** que aceita qualquer credencial válida. Mas o wizard mapeado (design.md §Wizard, tabela de passos) é Welcome→Plan→Account→Details→Number→Review→Success — **não há `login` nele**, e a matriz estado×tela **não lista login**. Fica uma tela órfã: onde ela entra? Um visitante em onboarding está **criando** conta, não logando. Se o objetivo é "cliente que volta", isso é outra entrada (ex.: Welcome com "já tenho conta → entrar"), e essa bifurcação não está desenhada: nem rota, nem estado, nem transição pós-login (vai para `my-plan`? retoma onboarding?). Como está, a implementação vai inventar o encaixe — e inventar fluxo de auth é exatamente o que mais custa depois. → **Exigir:** ou (a) tirar login do escopo desta fase (mantendo só `register`, que é o que o onboarding precisa) e registrar como dívida; ou (b) desenhar a entrada de login explicitamente — gatilho no Welcome, rota, estados (loading/erro-de-formato), e destino pós-login. Não deixar "existe uma tela de login" solto. _Ref: Req 4.6; design.md §Wizard, §Matriz._

- **B3 — Abandono e retomada: a spec promete um "pivot de retomada" que ela mesma não entrega, e o estado é volátil.**
  Req 6.3 diz que o MSISDN reservado "é o pivot de retomada conceitual" e a spec-mãe (AC#2) diz "retomar um onboarding interrompido **na mesma sessão**". Mas o `OnboardingProvider` é **client-only, em memória** (design.md §Wizard) — um refresh de página, troca de aba que descarta o processo, ou timeout do navegador **perde tudo**, inclusive a referência ao MSISDN já reservado no mock. Resultado real: o usuário reserva um número, o app recarrega, e o número está reservado no store do resource-mock mas **inacessível** ao usuário (que agora começa do zero e pode pegar outro) — "faz errado e não percebe", e no backend real isso é um MSISDN preso. → **Decidir e escrever na spec:** ou (a) assumir honestamente que não há retomada nesta fase e **remover a promessa de "pivot de retomada"** do Req 6.3 (ela está acima do que a implementação faz); ou (b) persistir o mínimo não-secreto (selectedOfferId, reservedMsisdn, step) em `sessionStorage` para sobreviver a refresh, com expiração. A promessa atual e a implementação descrita se contradizem — é a quinta frase ("contradiz"). _Ref: Req 6.3; spec-mãe AC#2; design.md §Wizard (estado em memória)._

- **B4 — Todo número de dinheiro: o review precisa dizer sobre que prazo o preço é, e a renovação automática precisa estar no resumo antes de confirmar.**
  Os planos "up" têm `validityDays: 30` + `autoRenew: true` (design.md §Catálogo). O `review` resume "plano + preço" (Req 7.1) e a regra de escrita manda cada valor declarar sua natureza. Mas **"€14,90" sem "a cada 30 dias, renova automaticamente" é um preço que a pessoa lê como pagamento único** — e ela está prestes a confirmar uma **ação consequente que cria uma assinatura recorrente**. Num prepaid com auto-renovação, não dizer isso no ponto de confirmação é "faz errado e não percebe" e, em mercado UE (de-AT), é exposição de conformidade de consumidor. → **Exigir:** o review mostra, por extenso e localizado, "€14,90 / 30 dias · renova automaticamente" e o saldo inicial €0 declarado como saldo (não como se o plano já estivesse "pago e ativo"). O botão de confirmar nomeia isso (ver E1 em Escrita). _Ref: Req 7.1, 7.2; DESIGN.md §Typography "every monetary value states its nature"; design.md §Catálogo (autoRenew)._

### Vale corrigir

- **V1 — Estado de concorrência do MSISDN está na reserva, mas não na seleção estável.**
  A matriz trata "número foi levado" no momento do `reserveMsisdn` (design.md §Matriz, linha `number (reserva)`). Falta o caso: o usuário reserva o número 0699-X, **volta** (Req 1.3 permite), fica 3 minutos no plano, volta ao number — a reserva ainda vale? Expira? Se o mock não tem TTL, vale; no real (DSIMA) reservas expiram. A spec deveria declarar o comportamento de **reserva expirada/liberada** como um estado ("essa reserva expirou, escolha de novo"), senão o review confirma um número que o backend real já soltou. _Ref: Req 6.2, 6.3; design.md §Matriz._

- **V2 — Falta o estado "parcialmente provisionado" / terminal de submit na matriz.**
  A orquestração tem 6 passos (createParty→…→getCustomer360) com retry por passo (design.md §Orquestração). A matriz cobre "erro + retry no passo que falhou". Mas falta o **erro terminal**: e se `submitOrder` falha repetidamente após party+customer já criados? O usuário fica com uma conta/party criada e nenhum plano — estado parcial real. A spec precisa dizer o que a tela mostra quando o retry esgota (não só "retry infinito"): uma saída ("salvamos sua conta; tente ativar o plano mais tarde em My plan" ou contato), e o que acontece ao MSISDN reservado nesse caso. "erro terminal" é um estado que machuca e não está na lista. _Ref: Req 7.3; design.md §Matriz (submit)._

- **V3 — Papéis não existem aqui, e isso está certo — mas convém declarar.**
  Onboarding é single-role (visitante→novo cliente). Não há admin, não há aprovador. Isso é correto para a tela, mas a spec não diz "esta journey é single-role" — vale uma linha para que a revisão de papéis não fique implícita num futuro `if`. Não é bloqueador; é higiene de spec. _Ref: —_

- **V4 — "ver todos os planos" (Req 2.3) não tem tela/estado.**
  Req 2.3 exige um "ver todos os planos" porque operadoras têm muitas ofertas. A matriz e o wizard não dizem se isso expande inline, abre sheet, ou vira rota — nem como o assist e o badge recommended convivem com a lista expandida. Com 4 planos Drei / 3 DreiGo no mock atual, "ver todos" é quase vazio hoje, mas a spec pede o padrão para o catálogo real. Definir o container (provável: expandir inline, sem rota) e o estado. _Ref: Req 2.3._

- **V5 — Checklist de força de senha: `role="status"` em cada tecla é ruído para leitor de tela.**
  design.md §A11y diz "cada critério com ícone+palavra; `role=status` ao mudar". Anunciar a cada caractere digitado o estado dos 4 critérios é verboso e atrapalha (WCAG 4.1.3, mas aplicado com juízo). Melhor: `role="status"` com **debounce** ou anúncio só quando um critério **vira** satisfeito/insatisfeito, não a cada input. A spec deveria dizer "anuncia a transição de critério, não cada tecla". _Ref: design.md §A11y; WCAG 4.1.3._

- **V6 — Cross-reference morto: a spec-mãe que esta fase herda está desatualizada em pontos que confundem a implementação.**
  A `onboarding-journey` declara herdar design system da spec-mãe. Mas a spec-mãe `design.md` diz **fonte "Inter", 13 estilos, Drei accent vermelho, ink navy #0F273B, "botões são ink"** — tudo **superado** pelo `DESIGN.md` ativo (Helvetica Neue, 11 estilos, Drei cyan #0096c5, "o botão primário é a marca preenchida"). A régua que vale é o `DESIGN.md` em `pocket-signal-care/design/`; mas quem implementar lendo a spec-mãe vai pegar tokens errados. → **Exigir:** a `onboarding-journey` afirma explicitamente "para tokens/cores/tipografia, a fonte de verdade é `design/DESIGN.md`; onde a spec-mãe divergir (fonte, accent Drei, regra do botão), vale o DESIGN.md". Uma linha evita um retrabalho de tema inteiro. _Ref: spec-mãe design.md §Tokens vs. DESIGN.md front matter._

### Refinamento (preferência declarada)

- **R1 — Ordem dos passos: `details` (nome) depois de `account` (email+senha) é defensável, mas considere fundir.** Hoje são dois passos: Account (email+senha) e Details (nome+sobrenome). Nome e email poderiam coexistir numa tela só ("sua conta": nome, email, senha), cortando um passo do wizard — menos carga, menos navegação. A separação atual espelha HBO/Peacock (conta primeiro, perfil depois) e é justificável; é preferência minha, declarada como tal. Se mantiver separado, ok. _Ref: Req 4, 5._

- **R2 — "Get started" no Welcome é genérico.** Nomeia a mecânica, não o resultado. "Choose my plan" ou "See plans" diria o que vem a seguir e reforça oferta-primeiro. Preferência. _Ref: Req 1.1._

---

## Acessibilidade — WCAG 2.2 AA

Os critérios citados na spec estão **corretos**; abaixo o que falta ou precisa de ajuste. Contexto Ericsson: operadora/comprador público pede ACR (EN 301 549); achados aqui têm peso de resposta de RFP, não só higiene.

| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| **2.4.3 Focus Order + gestão de foco entre passos** | A spec cobre `aria-current` no stepper, mas **não** diz para onde o foco vai quando o passo muda. Num wizard SPA, trocar de passo sem mover o foco deixa o leitor de tela/teclado no botão antigo (que pode ter sumido). | Ao avançar/voltar, mover foco programático para o `<h1>`/título do novo passo (ou um container com `tabindex=-1`), e anunciar o passo. **Não está na spec e é o furo de a11y nº1 de wizard.** | Sim — 2.4.3 |
| **4.1.3 Status Messages (mudança de passo)** | design.md anuncia submit e checklist de senha, mas **não** anuncia a troca de passo em si ("Passo 3 de 6: seus dados"). | `role="status"` ou `aria-live="polite"` anunciando "Step N of M, <título>" a cada transição. | Sim — 4.1.3 |
| **3.3.1 / 3.3.3 Error** | Req 1.5 cobre erro inline + `aria-describedby`. Falta o **resumo de erro no submit do formulário** e o foco indo ao primeiro campo inválido. | No submit com erro, foco no primeiro campo inválido; `aria-invalid` já citado — ok. Acrescentar o movimento de foco. | Sim |
| **1.4.3 Contraste — exceção Drei A1 toca o onboarding** | O botão primário Drei é cyan #0096c5 com label branco ~3.3:1 (**abaixo de 4.5:1**) — exceção A1 declarada no DESIGN.md. O onboarding é **cheio de botão primário** ("Continue", "Confirm & activate"). A spec da Fase 5 não menciona que seu CTA principal herda uma exceção de contraste conhecida. | Declarar na spec que o CTA do onboarding opera sob a exceção A1 (ou exigir tratamento de label que passe 4.5:1). Num ACR isso **tem que** estar documentado como "partially supports" com a justificativa. | **Sim — crítico para ACR** |
| **2.5.8 Target Size (AA)** | A spec pede "alvo 44px". 44 é AAA (2.5.5); o mínimo AA é **24×24**. Pedir 44 não é erro (é mais seguro, e correto se rodar em tablet no PDV), mas o número citado como se fosse o critério AA está impreciso. | Manter 44 como meta de toque, mas citar 2.5.8 (24px) como o critério AA de conformidade; 44 é escolha de produto, não o piso WCAG. | Sim — 2.5.8 |
| **1.3.5 Autocomplete** | Req 1.5/5.1 citam `autocomplete` genérico. Especificar os tokens: `email`, `new-password` (no register — importante para não acionar sugestão de login), `given-name`, `family-name`. | Nomear os valores de `autocomplete` por campo; `new-password` no registro e `current-password` no login. | Sim — 1.3.5 |
| **2.2.1 Timing (reserva de MSISDN)** | Se a reserva do MSISDN expira (ver V1), é um limite de tempo. | Se houver TTL, avisar e permitir estender/renovar; não descartar o progresso silenciosamente. | Sim — 2.2.1 |
| **3.3.7 Redundant Entry** | O email é coletado no `account`; o `review` e o `createParty` o reusam. Garantir que o email **não** é re-pedido em `details`. | A spec já separa (email vem do account) — ok, só confirmar que details não repete. Conforme. | Sim — 3.3.7 (atendido) |

Bem tratado na spec: cor+palavra em estados (não só cor), `aria-disabled`+motivo em oferta inelegível, foco visível nos 2 temas, skeleton que nunca mostra valor falso.

## Estados faltando
- **Erro terminal do submit** (retry esgotado, conta parcial) — V2.
- **Reserva de MSISDN expirada/liberada** — V1.
- **Login: nenhum estado na matriz** (se login ficar no escopo) — B2.
- **"Ver todos os planos": sem estado/container** — V4.
- **Refresh/retomada: o que a tela mostra ao voltar com estado perdido** — B3.
- **Sucesso parcial do `getCustomer360`** está tratado ("sincronizando…" não-bloqueante) — ok, bom.

## Carga — o que perguntei e o que ficou sem resposta
- **Quantos planos no pior caso?** Mock: 4 Drei / 3 DreiGo. Catálogo real: "muitas" (Req 2.3) — daí o "ver todos". A partir de quantos a tela vira scroll/sheet? Sem resposta (V4).
- **Latência dos seams no submit:** 300–900ms por passo × 6 passos = até ~5,4s de "ativando…". A spec trata com `role=status` por passo — bom. Mas 5s é tempo real; o progresso precisa mostrar **qual** passo (não só spinner), o que a spec já pede. Ok.
- **Concorrência no MSISDN:** tratada na reserva; não tratada na expiração (V1).
- **Duas pessoas / mesma sessão:** não aplicável (visitante único criando conta). Correto não tratar.
- **Ação irreversível:** o submit cria party+customer+order no backend real. Hoje é mock, mas o botão de confirmar dispara algo que, no real, **não tem desfazer trivial**. O review é a confirmação proporcional — ok —, mas o texto do botão precisa dizer o que acontece (Escrita E1).

## Papéis
Single-role (visitante → novo cliente). Nenhum papel adicional usa estas telas. Declarar na spec (V3). Sem seção de permissão necessária.

## Aderência ao sistema
Régua usada: **`/Users/earatat/pocket-signal-care/design/DESIGN.md`** (encontrado em `design/`, é o que vale para o projeto-alvo).
- Componentes citados (stepper, option-row, result-head, skeleton, state-block, notice-banner, button-primary) **todos existem** no DESIGN.md. Sem reinvenção. ✔
- **Divergência herdada:** a spec-mãe traz tokens antigos (Inter, Drei vermelho, ink navy, "botões são ink") que **contradizem** o DESIGN.md ativo. Não é a Fase 5 que erra, mas ela aponta para a fonte errada (V6). ✔ corrigir a referência.
- Saldo inicial €0 declarado como saldo — coerente com a regra "cada valor declara sua natureza". ✔
- Stepper "rótulo + estado, não só cor" — coerente com "cor nunca é o único sinal". ✔

## Escrita — antes → depois
A análise é PT; as strings vão para o produto em **en-US** (de-AT depois). Sentence case; um conceito, um termo.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| Welcome CTA | "Get started" | "See plans" | Nomeia o resultado + reforça oferta-primeiro (R2) |
| Review / confirm | "Confirm & activate" | "Confirm and activate — €14.90 / 30 days" (ou valor via Intl) | Ação consequente + recorrente: o botão diz o que acontece e o preço/prazo (B4) |
| Plan step price | "€14.90" | "€14.90 / 30 days · auto-renews" | Preço sem prazo/renovação lê-se como pagamento único (B4) |
| Assist entry | "ajude-me a escolher" (PT na spec) | "Help me choose" | String de produto é en-US; a spec usa PT no corpo — garantir a chave i18n en-US |
| Assist result | "Suggested for you" | "Suggested for you" ✔ | Já honesto (sugestão, não "best"). Manter |
| MSISDN concorrência | "esse número foi levado, escolha outro" (PT) | "That number was just taken. Pick another." | String en-US; diz o que houve + próximo passo ✔ |
| Submit terminal (falta) | — | "We saved your account. We couldn't activate your plan — try again in My plan." | Estado terminal hoje inexistente (V2) |
| Success | "You're all set, <name>" | "You're all set, <name>" ✔ | Bom. Manter |

Termo a confirmar antes de virar glossário: o conceito "account" (credencial auth) vs "customer/party" (CPR) — a spec já os separa bem no glossário dela; manter "account" só para a credencial e nunca como sinônimo de "customer" na UI.

## Build de demo
Não é build de demo (é spec pré-implementação). Nada a verificar aqui. Quando houver build, revisar plausibilidade dos MSISDNs fake (formato AT: +43 6xx), preços coerentes com drei.at, e latência real com catálogo cheio, não com 3 registros.

## Preciso saber antes
- **A tela de login fica no escopo da Fase 5?** Se sim, suspende B2 (precisa de rota+estados+destino); se não, vira dívida e B2 se resolve removendo-a do Req 4.6. _(suspende B2)_
- **Há retomada após refresh, ou só navegação dentro da sessão viva?** A resposta decide entre remover a promessa de "pivot de retomada" (B3a) ou persistir estado não-secreto (B3b). _(suspende B3)_
- **Reserva de MSISDN tem TTL no mock?** Decide V1 e o critério 2.2.1. _(suspende V1)_
- **O produto quer crédito de boas-vindas?** A spec decide saldo €0 (honesto) com gancho de topUp. Se mudar, muda B4 (o review mostraria crédito). _(não suspende nada; confirmar)_

## Limites desta revisão
- **Sem app rodando e sem imagens.** Revisei texto de spec, não runtime nem render. Contraste (exceção A1), foco visível, ordem de tabulação e anúncios de leitor de tela precisam ser confirmados em build real com `ui-capture` + ferramenta de contraste — o que esta revisão não faz.
- **Sem link de Figma na delegação** → paridade Figma↔código: não avaliada.
- **Régua:** usei o `DESIGN.md` de `pocket-signal-care/design/` (projeto-alvo). A spec-mãe foi lida como contexto herdado, não como régua de tokens (está superada — V6).
- **`wireframe-review` e `fixing-accessibility` não rodam aqui** (precisam de Bash/edição e de imagens): o diff de estados e a correção de HTML ficam para a thread principal quando houver build.
- Achados ordenados por impacto em quem usa o onboarding.
