# Revisão visual — Onboarding (Fase E, runtime)

Revisão **de render** da jornada de onboarding do self-care MVNO white-label (marca **Drei**,
accent cyan), a partir das 13 capturas Playwright em `docs/design/capturas/r1/`
(desktop 1366, tema claro único, coluna mobile de 390px centrada — o cinza ao redor é
esperado). Régua: `design/DESIGN.md` (sistema Fuon adaptado). Console limpo (sem erro
capturado). Comparado também com a revisão de spec anterior (`2025-02-14-onboarding-journey-fase5.md`)
para checar se os bloqueios B1–B4 daquela fase aparecem no render.

**Natureza da verificação:** li cada PNG. O que é hierarquia, espaçamento, sobreposição e
alinhamento eu **vi**. O que é valor de token (hex exato do link, espessura de borda
selecionada, ratio de contraste) eu **não medi a partir de imagem** — está marcado como
"confirmar no token/código". Não rodei a aplicação nem editei código (não tenho Bash aqui).

## Promessa da tela
"Em poucos passos claros, de visitante a cliente prepaid ativo: escolha um plano, adicione
extras, pegue um número, crie a conta e confirme — sabendo onde você está e podendo voltar."

## O que está resolvido (não mexer)
- **Hierarquia preço-primeiro no card de plano está certa (02, 03, 04).** O maior elemento do
  card é o preço (`€14.90`, bold, à direita); o volume de dados (`15 GB`) é secundário à
  esquerda; a linha "Renews every 30 days · cancel anytime" é terciária. É exatamente o que o
  DESIGN.md pede ("the only big thing is the number that matters"). Não mexer.
- **O review (11) resolveu o B4 da Fase 5.** "up · €14.90 every 30 days · auto-renews", add-on
  precificado, número, nome, conta, e "You start with no balance — top up any time to use your
  plan." Cada valor declara sua natureza e o prazo/renovação está no ponto de confirmação. É o
  tratamento correto de uma ação consequente. Não reabrir.
- **Number (07) e Add extras (05/06) estão limpos.** Option-rows, radio, preço à direita, helper
  de rodapé ("Pick a number to continue."), primário desabilitado quando nada selecionado. O
  rodapé aqui fica **abaixo** do card, sem sobrepor — é o comportamento correto que os passos
  altos deveriam ter.
- **Stepper é coerente.** Ponto ativo = pílula alongada, concluídos/futuros = redondos; "Step N
  of 6 · <título>" acompanha. Em 02/03/04 os 2 primeiros dots corretos, em 07 o 4º, em 11 o 6º,
  em 12 todos preenchidos. Consistente entre telas.
- **Painel de assist (03) bem desenhado** como painel quieto (tint), perguntas Yes/No em chips,
  "Suggest a plan" primário e "Skip" como texto. O conteúdo do painel está certo — o problema
  dele é a sobreposição (abaixo), não o desenho.
- **Success (12) limpo e honesto** — "no balance yet", "Top up now" primário, "Maybe later"
  secundário texto, ícone de conta aparece no app-bar.

---

## Achados

### Bloqueia entrega

- **BE-1 — O rodapé fixo (Back/Continue) é opaco e cobre conteúdo do card em todo passo mais alto
  que a coluna; na tela de conta ele esconde o campo "Confirm password" inteiro.**
  Frase: *"a pessoa, ao tentar criar a conta, com o teclado/scroll numa coluna de 390px, **não
  consegue** ver nem preencher o campo Confirm password — ele está atrás do rodapé branco."*
  Visível em **09-account** e **10-account-filled**: o rótulo "Confirm password" aparece cortado
  na borda superior do rodapé e o input correspondente está totalmente encoberto. O mesmo rodapé
  cobre cards de plano em **02** (esconde o 3º plano, "up Max"), em **03** (esconde o 1º, "up
  Start") e em **04** (corta o "up Unlimited+"). Não é aperto de espaçamento: é conteúdo
  interativo renderizado atrás de uma barra opaca. Num produto de checkout, um campo obrigatório
  inalcançável é bloqueio de conclusão.
  → **Corrigir:** o rodapé fixo precisa de um `padding-bottom` equivalente à sua altura no
  container rolável (ou deixar de ser fixo e fluir ao fim do card), de modo que o último campo/card
  role **acima** dele e nunca por baixo. Verificar em 390px de altura real, não só em 1366 de
  largura — na altura de telefone a sobreposição é maior. _Telas: 02, 03, 04, 09, 10._

- **BE-2 — O app-bar superior (wordmark + EN/DE) também é fixo e opaco, e corta o conteúdo no meio
  da tela quando o passo rola.**
  Frase: *"a pessoa, ao rolar o passo de plano, vê uma faixa branca atravessar o painel de
  perguntas — o produto parece quebrado."*
  Em **04-plan-selected** a faixa branca do header cruza o painel "A few quick questions" bem no
  meio ("Do you travel in the EU?" fica metade escondido). O header deveria ou empurrar o
  conteúdo abaixo dele (offset no topo do scroll) ou o conteúdo rolável deveria ter
  `padding-top` igual à altura do header. Combinado com BE-1, a coluna rolável está sendo
  sanduichada por duas barras opacas que comem conteúdo nas duas pontas.
  → **Corrigir:** reservar o espaço do header fixo no topo da área rolável (mesmo princípio do
  rodapé em BE-1). _Tela: 04 (e qualquer passo alto o suficiente para rolar sob o header)._

### Vale corrigir

- **VC-1 — A lista de planos é longa e, somada ao painel de assist aberto, estoura muito a coluna
  (03, 04).** Com o painel de assist expandido **mais** os 4 cards de plano **mais** o banner
  "Prepaid, no contract…", o passo 2 fica com ~3× a altura da tela. Hoje são 4 planos; o DESIGN.md
  e a Fase 5 (V4) preveem catálogo real "com muitas ofertas". Sem um teto, esse passo vira uma
  rolagem muito longa onde o "Continue" (fixo) e o plano selecionado podem ficar distantes.
  → Considerar: colapsar o painel de assist assim que uma sugestão é dada (ou ao rolar para a
  lista), e/ou mostrar o plano recomendado primeiro com os demais atrás de um "See all plans"
  (o padrão que a Fase 5 V4 pediu e que ainda não existe no render). _Telas: 02, 03, 04._

- **VC-2 — A borda de card selecionado não está legível no render (04).** DESIGN.md: "selected
  card = 2 px `accent-ink` border". No 04 o card "up" selecionado se distingue basicamente pelo
  **radio preenchido** de cyan; não consigo ver uma borda de 2px accent-ink mais forte que a
  hairline dos outros cards. Se a seleção está só no radio, é sinal fraco (e, no limite, risco de
  "cor/elemento único"). → Confirmar no CSS que o card selecionado recebe `border-2
  border-accent-ink`; se não recebe, aplicar. _Tela: 04. (Confirmar no token — não medível por
  imagem.)_

- **VC-3 — Os links "More info" e "Change" parecem cyan brilhante; o DESIGN.md manda link em
  `accent-ink` (#0073a0), não no cyan de marca (#0096c5).** Em 02/03/04 ("More info") e em 11
  ("Change") a cor do link lê como o cyan brilhante do botão. Se for #0096c5, é ~3,3:1 em branco —
  abaixo de 4.5:1 para texto (1.4.3), e o DESIGN.md é explícito: "the link and selection ring use
  `accent-ink`, not the bright cyan". → Confirmar o token do link no CSS; se estiver usando
  `accent` em vez de `accent-ink`, trocar. _Telas: 02, 03, 04, 11. (Confirmar no token — não
  medível por imagem com segurança.)_

- **VC-4 — O checklist de senha usa círculos de rádio no estado não-satisfeito (09).** Em 09
  (vazio) os 4 critérios aparecem como círculos ocos tipo radio; em 10 (satisfeito) viram check
  cyan + palavra (bom — cor+palavra). O problema é o estado **não-satisfeito**: círculo oco lê
  como "opção selecionável", não como "requisito ainda não cumprido", e o único sinal de
  não-cumprido é a forma/cor. → Usar o mesmo glyph nos dois estados (ex.: círculo vazio → check),
  nunca um controle que pareça clicável; garantir que "não cumprido" tenha sinal além da cor.
  _Tela: 09. (Relaciona-se ao V5 da Fase 5 sobre o anúncio por leitor de tela.)_

- **VC-5 — "Skip" vira o botão primário cyan quando nada está selecionado em Add extras (05).**
  Em 05 o primário cheio de cyan diz "Skip"; em 06 (com extra marcado) vira "Continue". Preencher
  o botão de marca com "Skip" dá a uma ação de **pular** o peso visual da ação principal. É
  defensável (sempre há uma ação primária no rodapé), mas considerar "Skip" como secundário
  (texto, como o "Back") e deixar o primário cheio só para "Continue" quando houver seleção —
  coerente com 07, onde o primário fica desabilitado até escolher. _Tela: 05._

### Refinamento (preferência declarada)

- **R-1 — Add extras usa radio (círculo), sugerindo seleção única (05/06).** O review (11) mostrou
  só um add-on, então single-select pode ser intencional. Mas "extras" normalmente é múltipla
  escolha, e o DESIGN.md tem checkbox 6px para multi e radio para single. Se a intenção é permitir
  +1 GB **e** +1 GB EU juntos, o controle deveria ser checkbox. Preferência/pergunta, não defeito
  visível. _Tela: 05, 06. (Ver "Preciso saber antes".)_
- **R-2 — Banner "Prepaid, no contract…" repete em 02/03/04 ocupando topo da coluna já apertada.**
  É informação boa, mas num passo que estoura a altura (VC-1) ela empurra os planos para baixo.
  Considerar movê-la para o subtítulo ou mostrá-la uma vez. Preferência. _Tela: 02, 03, 04._

---

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| **1.4.3 Contraste (texto)** | Links "More info"/"Change" parecem cyan brilhante #0096c5 (~3,3:1) em vez de accent-ink #0073a0 (~4,6:1) — VC-3. | Confirmar token do link = `accent-ink`; se for `accent`, trocar. | Sim — 1.4.3 |
| **1.4.3 Contraste (exceção A1, conhecida)** | Botão primário cyan #0096c5 + label branco ~3,3:1 em 05, 07, 11, 12. | **Exceção A1 documentada** no DESIGN.md (botão + hero). Não é achado novo; num ACR entra como "partially supports" com a justificativa A1. | Sim — documentar |
| **2.4.11 Focus not obscured** | O rodapé e o header fixos cobrem conteúdo (BE-1/BE-2); um controle que recebe foco atrás dessas barras viola "foco não encoberto". O campo Confirm password (09/10) é o caso claro. | Reservar espaço do header/rodapé na área rolável (BE-1, BE-2) resolve também isto. | Sim — 2.4.11 |
| **1.4.1 Use of color** | Checklist de senha não-satisfeito só por forma/cor (VC-4). | Glyph + palavra nos dois estados. | Sim — 1.4.1 |
| **2.5.8 Target size (AA = 24px)** | Não medi tamanhos a partir da imagem; os chips Yes/No (03) e os links de texto parecem pequenos. 44px é meta de produto (AAA 2.5.5), não o piso AA. | Confirmar ≥24×24 CSS px nos chips e links; manter 44 como meta de toque. | Sim — 2.5.8 (verificar) |

Não verificável por imagem: ordem de foco, foco visível, `aria-live` na troca de passo,
rótulos programáticos, `autocomplete`. Ficam para `fixing-accessibility`/runtime (ver Limites).

## Estados faltando (no que foi capturado)
- **Plano selecionado com borda forte** — aparentemente ausente/fraco (VC-2).
- Não capturados (fora do escopo deste round, mas são os que a Fase 5 marcou): erro terminal de
  submit (V2 da Fase 5), reserva de MSISDN expirada (V1), e o estado de "ver todos os planos"
  (V4). Não dá para revisar o que não foi renderizado — registrar para o próximo round de captura.

## Carga — o que a imagem respondeu e o que ficou em aberto
- **Quantos planos?** 4 no render (up Start / up / up Max / up Unlimited+). Já estouram a coluna
  junto com o assist (VC-1). No catálogo real "muitas" — sem teto desenhado (VC-1 + Fase 5 V4).
- **A partir de quando a tela muda de forma?** Não há ponto de virada desenhado (busca, "ver
  todos", colapso do assist). Hoje a resposta é "rola mais" — e rolar sob barras opacas é o BE-1/BE-2.
- **Altura real:** as capturas são 1366 de **largura**; a coluna é 390. A sobreposição já aparece
  a 1366; **em altura de telefone (ex.: 390×844) é pior** — não capturado, precisa de um round em
  viewport mobile real para medir o pior caso.

## Papéis
Single-role (visitante → novo cliente). Nenhum papel adicional usa estas telas. Coerente.

## Aderência ao sistema
Régua: **`/Users/earatat/pocket-signal-care/design/DESIGN.md`** (marca ativa: Drei).
- Preço-primeiro, banner tint, option-row, stepper, result-less success, pill nos botões,
  hairline+no-shadow: **aderentes**. ✔
- **Divergências a confirmar no token:** cor do link (VC-3, deve ser accent-ink), borda do card
  selecionado (VC-2, deve ser 2px accent-ink). São aderência de token, não de layout.
- **Exceção A1** (botão cyan) presente e esperada — não é divergência.

## Escrita — antes → depois
Strings vão para o produto em **en-US**; sentence case; um termo por conceito.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| Add extras footer (05) | "Skip" (como botão primário cheio) | manter texto, estilo secundário | "Skip" não é a ação principal; primário cheio deveria ser "Continue" (VC-5) |
| Plan step (02–04) | "More info" | "More info" ✔ | Rótulo ok; o problema é a cor do link (VC-3), não o texto |
| Review (11) | "Confirm and activate" | "Confirm and activate" ✔ | Já nomeia o resultado; preço/prazo estão na linha do plano acima (B4 resolvido) |
| Success (12) | "Maybe later" | "Maybe later" ✔ | Secundário honesto |

Nenhuma inconsistência de termo detectada no render (plan/add-on/top up usados de forma
coerente). "up"/"up Start"/"up Max"/"up Unlimited+" é a família de nomes de plano — ok, mas
confirmar que "up" sozinho (o recomendado) não se confunde com o verbo em cópia futura.

## Preciso saber antes
- **Add extras é single-select ou multi?** Se multi, o controle deve ser checkbox, não radio
  (R-1). _(suspende R-1.)_
- **Qual a altura mínima de viewport alvo (telefone real)?** BE-1/BE-2 foram vistos a 1366 de
  largura; o pior caso é em altura de telefone, não capturado. _(não suspende BE-1/BE-2 — eles já
  são visíveis — mas define o quanto de padding reservar.)_

## Limites desta revisão
- **Verifiquei render, não runtime.** Li as 13 PNGs. Não rodei a app, não tenho Bash/navegador,
  não tirei screenshot novo nem medi contraste/tamanho de alvo por ferramenta. VC-2, VC-3 e os
  tamanhos de alvo estão marcados como "confirmar no token/código" porque não são medíveis com
  segurança a partir da imagem.
- **Captura é desktop-largura (1366), tema claro único.** O pior caso de sobreposição (BE-1/BE-2)
  é em altura de telefone — recomendo um round de captura em viewport mobile (ex.: 390×844) e no
  tema escuro, se existir, para o próximo review.
- **Estados não renderizados** (erro terminal de submit, MSISDN expirado, "ver todos os planos")
  não foram revisados — não dá para revisar o que não está na captura. Registrados para o próximo
  round a partir das dívidas da Fase 5 (V1, V2, V4).
- **Sem link de Figma** → paridade Figma↔código: não avaliada.
- **`fixing-accessibility` não roda aqui** (precisa de Bash/edição de HTML): a correção de
  contraste de link, foco e `aria-live` fica para a thread principal/runtime.
- Achados ordenados por impacto em quem usa o onboarding. BE-1 e BE-2 são os únicos bloqueios; o
  resto é token e refinamento.
