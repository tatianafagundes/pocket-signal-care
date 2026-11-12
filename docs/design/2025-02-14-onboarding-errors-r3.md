# Revisão visual — estados de ERRO / edge do onboarding + self-care (Fase E, debt-closure, r3)

Revisão de **render + código** dos cinco estados não-felizes do self-care MVNO white-label
(marca **Drei**, accent cyan), a partir das capturas Playwright em
`docs/design/capturas/r3-errors/` (viewport de telefone real **390×844**, viewport-only,
rodapé fixado no fim, erros disparados por hook DEV de erro forçado). Régua:
`design/DESIGN.md` (sistema fuon adaptado; marca ativa Drei). Comparado com a rodada anterior
`docs/design/2025-02-14-onboarding-fase-e-visual.md` (os bloqueios BE-1/BE-2 de rodapé/header
fixos daquela rodada).

**Natureza da verificação.** Li os 5 PNGs **e** o componente de erro no código
(`src/components/onboarding/seam-error-notice.tsx`), o primitivo
`src/components/ui/alert.tsx`, o botão `src/components/ui/button.tsx` e a tela de review
`src/routes/onboarding/review.tsx`. Hierarquia, colocação e sobreposição eu **vi**; variante
de botão, papel ARIA, ausência de tint e a ação do retry eu **confirmei no código**. Não rodei
a app nem medi contraste com ferramenta — os ratios abaixo são calculados à mão pela fórmula
WCAG e marcados como "confirmar com `tools/contrast.py`". Sem link de Figma → paridade não
avaliada.

**Correção ao enunciado da delegação:** o enunciado chama o accent de "cyan" e cita a exceção
A1 "cyan+white" do botão primário. A régua é mais estreita: a exceção A1 cobre **só o botão
primário e o hero**. O texto de erro e os links **não** estão cobertos pela A1 — valem o piso
normal (4.5:1 texto / 3:1 gráfico). Não re-sinalizo o botão primário cyan; sinalizo onde o cyan
A1 vaza para fora do escopo dele (links "Change").

---

## Promessa da tela
Para cada estado de erro: "Algo que você pediu não carregou (ou não concluiu); eu te digo **o
que** falhou, que **o seu trabalho está a salvo**, e te dou **um caminho de volta óbvio** sem
você perder o que já fez."

## O que está resolvido (não mexer)
- **Um único componente de erro em toda a jornada.** Os cinco estados usam o mesmo
  `SeamErrorNotice` (`Alert variant="destructive"` do shadcn). Mesma caixa, mesma cor, mesmo
  botão, mesmo tom. A consistência de **padrão** que a delegação pede existe e é real — não é
  cinco implementações parecidas, é uma só. Não refazer.
- **O erro é anunciado a leitor de tela.** O `Alert` carrega `role="alert"` embutido
  (`alert.tsx`), então a mudança para o estado de erro é falada sem troca de tela. É o 4.1.3
  que um produto de trabalho quase sempre esquece. Está certo — não mexer.
- **Retry só quando faz sentido.** O componente só mostra "Try again" quando `error.retryable`
  (categoria "unavailable"). Erro de validação/conflito não ganha botão de repetição — o certo,
  porque repetir sem mudar a entrada não resolveria. Decisão correta, documentada no componente.
- **O texto de erro vem de chave i18n e nunca mostra código cru.** Fallback para a mensagem
  genérica se a chave não existir. Correto para en-US/de-AT e para não vazar stack ao usuário.
- **05 — o terminal está conceitualmente certo e é o achado positivo mais importante.** A cópia
  "We couldn't finish activating your plan. Your account is saved — you can try again." faz
  exatamente as três coisas: diz o que falhou, **tranquiliza** (conta salva) e oferece retry. O
  **resumo inteiro fica preservado** abaixo (Plan/Add-ons/Number/Name/Account), com os "Change"
  e o "Confirm and activate" ainda disponíveis. O nível é reassuring, não alarmante — o tom
  certo para "quase deu, não perca nada". Confirmei no código que o resumo é remontado do estado
  no render, então nada fica obsoleto. Manter o conceito (ressalvas de layout e de botão duplo
  abaixo).
- **04 — colocação do erro acima da lista, lista ainda usável: certo.** O aviso fica no topo do
  card, a lista de números abaixo continua selecionável, o rádio marcado e "Reserve this number"
  ativo. É a colocação correta para um erro **parcial e recuperável** (reservar falhou, escolher
  não): o erro não bloqueia o conteúdo, explica por que o passo anterior não concluiu e deixa a
  pessoa tentar de novo. Manter.
- **O rodapé fixo não sobrepõe nesta captura (04, 05).** Em 04 "Back / Reserve this number" e em
  05 "Back / Confirm and activate" ficam ancorados no fim do viewport 390×844 **sem** comer
  conteúdo. Em telas curtas de erro (01/02/03) não há rolagem. O pior caso de BE-1/BE-2 da
  rodada anterior não reaparece **nestes** estados — mas eles eram de passos longos (plano com
  assist, conta), não destes; não dou por resolvido o BE-1/BE-2, só registro que aqui não
  incide.

---

## Achados

### Bloqueia entrega

- **BE-E1 — No terminal (05), "Try again" e "Confirm and activate" são dois botões que fazem a
  MESMA coisa na mesma tela; a pessoa não sabe qual é o caminho.**
  Frase: *"a pessoa, depois de a ativação falhar, com a conta já salva, **não confia** em qual
  botão reexecuta a ativação — há um 'Try again' no aviso vermelho e um 'Confirm and activate'
  no rodapé, e nada diz que são a mesma ação."*
  Confirmado no código (`review.tsx`): `SeamErrorNotice onRetry={() => void confirm()}` e
  `WizardNav onContinue={() => void confirm()}` chamam **a mesma** função `confirm()`. Dois
  gatilhos idênticos, um vermelho-secundário e um cyan-primário, visíveis juntos. Em ação
  consequente (ativar conta, criar linha), ambiguidade de "qual botão" é exatamente onde a
  pessoa hesita ou clica duas vezes. Nos outros quatro estados há **um** caminho de volta; só o
  terminal tem dois, e é o estado onde mais importa ter um.
  → **Corrigir:** uma recuperação por tela. Ou (a) remover o "Try again" do aviso no caso
  terminal e deixar o rodapé "Confirm and activate" como o único gatilho de retry (o aviso passa
  a ser só a mensagem "account is saved — you can try again below"); ou (b) manter o "Try again"
  no aviso e **esconder/renomear** o botão do rodapé enquanto houver `terminalError`. Recomendo
  (a): o rodapé já é o lugar da ação primária na jornada inteira; o aviso não precisa duplicá-la.
  _Tela: 05._

### Vale corrigir

- **VC-E1 — O botão "Try again" não é pílula e usa fonte 12px; diverge do botão do sistema em
  todos os cinco estados.**
  Frase: *"**contradiz** a régua — DESIGN.md: 'pill (999) on buttons (primary + secondary)'; o
  retry sai com `rounded-md`."*
  Confirmado: `SeamErrorNotice` usa `<Button variant="outline" size="sm">`. No `button.tsx`,
  `outline` = `rounded-md` (não pílula) **+ `shadow-sm`** (a régua é "no shadow"), e `size="sm"`
  = `text-xs` (12px, abaixo do `control`/`body-sm` do sistema). O `min-h-11` conserta só a
  altura de toque (44px, ok), não o raio, a sombra nem o tamanho de fonte. Visível nas cinco
  capturas: o retry é um retângulo arredondado pequeno, não a pílula branca de `border-input` do
  sistema. É o mesmo componente nos cinco, então a divergência é consistente — mas consistente
  com a régua ela não é.
  → **Corrigir:** dar ao retry o estilo de `button-secondary` do sistema (pílula, `border-input`,
  sem sombra, fonte `control`). Como é um só componente, conserta os cinco de uma vez.
  _Telas: 01, 02, 03, 04, 05._

- **VC-E2 — O aviso de erro não usa `danger-tint` e a borda vermelha está a 50% de opacidade; o
  sinal fica mais fraco que o `notice-banner` da régua.**
  Frase: *"**contradiz** a régua — o `notice-banner` danger pareia com `danger-tint`
  (`#fbe5e3`); o aviso shippado tem fundo branco e borda `border-destructive/50`."*
  Confirmado em `alert.tsx`: variante `destructive` = `text-destructive` + `border-destructive/50`,
  sem classe de fundo (herda branco). O texto vermelho `#c2281f` em branco é ~5.2:1 (passa 4.5:1,
  **ok** — confirmar com `tools/contrast.py`). O problema não é o texto, é a **borda a 50%**:
  sobre branco cai para bem abaixo de 3:1, então o contorno que distingue "isto é um erro" é
  tênue. Não viola 1.4.11 porque o erro também é carregado por texto+palavra (cor não é o único
  sinal), mas enfraquece o componente à toa.
  → **Corrigir:** aplicar o `notice-banner` danger da régua — fundo `danger-tint` `#fbe5e3` e
  borda `danger` `#c2281f` em opacidade cheia (≥3:1). Num tint, o texto do link/ação dentro do
  aviso toma a cor do status, não o accent (regra da régua). _Telas: 01, 02, 03, 04, 05._

- **VC-E3 — Os links "Change" no review (05) saem no cyan brilhante #0096c5 (~3.3:1), não no
  `accent-ink` #0073a0 acessível.**
  Frase: *"**contradiz** a régua e falha 1.4.3 — DESIGN.md: 'links/rings use accent-ink
  #0073a0'; o A1 é só botão+hero."*
  Confirmado em `review.tsx`: `SummaryRow` usa `<Button variant="link">`, e `link` no
  `button.tsx` = `text-primary`. Nesta montagem o `primary` é o botão cheio da marca = cyan Drei
  `#0096c5` (~3.3:1 em branco). Então os cinco "Change" lêem como o cyan de botão, abaixo de
  4.5:1 para texto, e fora do escopo da exceção A1. É o mesmo VC-3 da rodada anterior, agora
  **confirmado no código** para a tela de review (que é um dos estados de erro em revisão). Vale
  para os "Change" mesmo fora do estado de erro.
  → **Corrigir:** o link deve usar `accent-ink` (`text-accent-ink`), não `text-primary`. Afeta
  todo link de texto montado via `variant="link"`. _Tela: 05 (e qualquer tela com "Change"/links
  de texto). Confirmar o token com `tools/contrast.py`._

### Refinamento (preferência declarada)

- **R-E1 — Em 01/02/03 o aviso é uma caixa dentro do card (card-in-card); em 04 é full-width no
  topo do card.** As duas colocações são defensáveis (01/02/03 o erro é o conteúdo inteiro do
  passo; 04 o erro acompanha uma lista que segue usável). Só registro a diferença visual: a
  caixa interna em 01/02/03 deixa uma moldura branca grande e vazia à direita do botão, porque o
  `Alert` é `w-full` mas o conteúdo (texto curto + botão pequeno) não preenche. Não é defeito;
  se incomodar, encostar o card no conteúdo ou centralizar verticalmente o bloco. Preferência.
  _Telas: 01, 02, 03._

- **R-E2 — "Something went wrong. Please try again." é genérico de propósito nestes disparos**
  (erro forçado categoria "unavailable"), e a cópia específica por erro existe em código — então
  não julgo a string genérica. Só deixo a observação de produto: quando o backend real devolver
  a categoria, confirmar que **cada** chave `onboarding.seamError.*` diz o que falhou **e** o
  próximo passo (não só "tente de novo"). Preferência/para o round de cópia real. _Telas:
  01–04._

---

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| **1.4.3 Contraste (texto)** | Links "Change" (05) em cyan #0096c5 ~3.3:1 em vez de accent-ink #0073a0 (~4.6:1) — VC-E3. Fora do escopo da exceção A1. | Link = `accent-ink`. | Sim — 1.4.3 |
| **1.4.11 Contraste (não-texto)** | Borda do aviso a `border-destructive/50`: sobre branco cai abaixo de 3:1 — VC-E2. Não é violação dura (erro também em texto+palavra), mas é o contorno do componente de status. | Borda `danger` em opacidade cheia + fundo `danger-tint`. | Sim — 1.4.11 (fronteiriço) |
| **4.1.3 Status messages** | **OK.** `Alert role="alert"` anuncia o erro; em 05 há `role="status"` sr-only para o progresso de submit. Nada a corrigir — registrado como resolvido. | — | Sim — passa |
| **1.4.3 (exceção A1, conhecida)** | Botão primário cyan + label branco ~3.3:1 (ex.: "Reserve this number" 04, "Confirm and activate" 05). | **Exceção A1 documentada** (botão+hero). Não re-sinalizado. | Documentar |
| **2.5.8 Target size (AA=24px)** | Retry tem `min-h-11` (44px, ok). "Change" (05) tem `min-h-11` também. Não medi largura por imagem. | Confirmar largura ≥24px; 44 é meta AAA, não piso. | Verificar |

Não verificável por imagem/leitura estática: ordem de foco, foco visível não encoberto sobre
os estados de erro, `autocomplete`. Ficam para `fixing-accessibility`/runtime (ver Limites).

## Estados faltando
- Nenhum estado de erro ausente **dentro** do que foi pedido — os cinco cobrem lista (01/02),
  detalhe (03), parcial-recuperável (04) e terminal (05).
- A régua e a rodada anterior ainda listam, não capturados aqui: **MSISDN reservado expirado**
  (o número segurado some antes de concluir — a Fase 5 marcou como V1) e **edição concorrente**
  no self-care. 04 cobre "reservar falhou", não "reserva expirou enquanto você preenchia o
  resto". Registrar para o próximo round; não é falha desta entrega.

## Carga — o que a imagem respondeu e o que ficou sem resposta
- **Lista de números (04):** 5 opções no mock. No real, quantos MSISDN candidatos? Se dezenas, o
  aviso no topo + a lista pode exigir que o aviso role junto ou fique fixo — não desenhado.
  _(não suspende achado; é pergunta de carga.)_
- **Review (05):** o resumo tem 5 linhas fixas — carga estável, sem ponto de virada. Ok.
- **Latência do submit (05):** `confirm()` encadeia submitOrder + getCustomer360. Há `role=status`
  sr-only para progresso (bom), mas **não** vi um estado visual intermediário (spinner/disable)
  descrito na imagem — o `busy`/`continueDisabled` existe no código. Confirmar em runtime que
  durante o submit o botão fica claramente ocupado, senão a pessoa clica de novo (agrava BE-E1).

## Papéis
Single-role (visitante → novo cliente no onboarding; titular no self-care). Nenhum papel
adicional usa estes estados. Coerente.

## Aderência ao sistema
Régua: **`/Users/earatat/pocket-signal-care/design/DESIGN.md`** (marca ativa: Drei).
- **Aderente:** um só componente de erro, `role="alert"`, retry condicional a `retryable`,
  texto de status por cor+palavra, resumo preço-primeiro preservado em 05, rodapé fixo sem
  sobrepor nestes estados. ✔
- **Divergências (confirmadas no código):** retry não-pílula + com sombra + fonte 12px (VC-E1);
  aviso sem `danger-tint` e borda a 50% (VC-E2); link "Change" em cyan em vez de accent-ink
  (VC-E3). São divergências de **token/variante**, não de layout — o padrão está certo, o
  acabamento diverge da régua.
- **Exceção A1** (botão cyan) presente e esperada — não é divergência.

## Escrita — antes → depois
Strings em en-US; sentence case; um termo por conceito.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| 05 terminal | "We couldn't finish activating your plan. Your account is saved — you can try again." | manter o texto; ver BE-E1 sobre o botão | Cópia correta e tranquilizadora; o problema é o botão duplicado, não a frase |
| 01–04 | "Something went wrong. Please try again." | (genérico de propósito aqui) manter; validar as chaves específicas no round de backend real | A cópia por-erro existe em código; não se julga a genérica — R-E2 |
| 05 retry (aviso) | "Try again" | se adotar BE-E1(a): remover; a ação fica em "Confirm and activate" | Evita dois gatilhos para a mesma ação |
| 04 | "We'll keep your number reserved while you finish signing up." | manter ✔ | Diz o que o sistema faz com o número — bom; cobre parcialmente a expiração (mas não o estado expirado em si) |

Nenhuma inconsistência de termo detectada (plan/add-on/number/account coerentes com a régua).

## Preciso saber antes
- **BE-E1 — intenção dos dois botões em 05:** "Try again" e "Confirm and activate" devem ser a
  mesma ação (hoje são, no código)? Se sim, um deve sair. Qual preferem manter — o do aviso ou o
  do rodapé? _(suspende a escolha entre BE-E1(a) e (b), não o achado — o achado vale de qualquer
  forma.)_
- **Quantos MSISDN candidatos no real (04)?** Define se o aviso precisa rolar junto ou fixar.
  _(suspende um eventual achado de carga em 04, não os atuais.)_
- **Há um `DESIGN.md` em `app/` ou só este em `design/`?** Usei `design/DESIGN.md` (o único no
  projeto; o caminho da delegação `.../design/DESIGN.md` confere). Se houver outro mais próximo
  das telas, dizer. _(não suspende achados — todos citam a régua que usei.)_

## Limites desta revisão
- **Verifiquei render + leitura de código, não runtime.** Li os 5 PNGs e os 4 arquivos de
  código relevantes. Não rodei a app, não medi contraste com `tools/contrast.py`, não tirei
  screenshot novo. Os ratios (~5.2:1 do texto de erro; ~3.3:1 do cyan; ~4.6:1 do accent-ink)
  são calculados à mão e precisam ser confirmados com a ferramenta antes de fechar o ACR.
- **A ferramenta de busca textual (grep) não indexou este repo de forma confiável** nesta sessão
  (retornou "sem resultados" para strings que existem nos arquivos que li). Então não afirmo
  "só estes lugares usam o componente"; confirmei o componente, o review e os primitivos por
  **leitura direta**, não por busca exaustiva. Quem for aplicar VC-E1/VC-E3 deve varrer todos os
  usos de `variant="link"` e `variant="outline"` antes de dar por completo.
- **Sem link de Figma** → paridade Figma↔código não avaliada.
- **`fixing-accessibility` não roda aqui** (precisa de Bash/edição de HTML): a troca de token do
  link, a borda/tint do aviso e a confirmação de foco não encoberto ficam para a thread
  principal/runtime.
- **BE-1/BE-2 (rodapé/header fixos da rodada anterior) não reincidem nestes cinco estados**, mas
  não estão verificados como resolvidos nos passos longos (plano+assist, conta) — isso é de outra
  captura, não desta.
- Achados ordenados por impacto em quem usa. BE-E1 é o único bloqueio (dois botões, mesma ação,
  no estado mais consequente); VC-E1/E2/E3 são token/variante contra a régua; o resto é
  preferência.
