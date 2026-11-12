# Revisão de sistema — add-ons (buy) + erro em três superfícies + continuidade My plan (Fase 6, pass de sistema)

Revisão **de sistema** (não de uma tela): o que mudou em duas entregas da Fase 6, lido como
experiência conectada. Régua: **`design/DESIGN.md`** (sistema Fuon adaptado; marcas Drei cyan
e DreiGo roxo), tokens em `src/styles/tokens.css` + `src/styles.css`. Código lido:
`src/components/add-ons/add-on-card.tsx`, `src/routes/add-ons.tsx`,
`src/components/onboarding/seam-error-notice.tsx`, `src/components/ui/button.tsx`,
`src/components/ui/alert.tsx`. Capturas 390×844 em `docs/design/capturas/fase6-buy/`
(01-idle, 02-success, 03-error, 04-dreigo-success, 05-my-plan-after-buy). Rodadas anteriores
lidas e **não re-litigadas**: `2025-02-15-fase6-buy-addon.md` (buy-flow) e
`2025-02-14-onboarding-errors-r3.md` (erros).

**Natureza da verificação.** Li os 5 PNGs e os 5 arquivos de código. Forma, hierarquia,
sobreposição, peso visual e cor **eu vi**; `role`/`aria`/variante de botão/opacity de disabled
**confirmei na fonte**. Ratios de contraste não medi por ferramenta — uso os do
`tokens.css`/`DESIGN.md` e marco o que depende de medição. Não rodei a app, não tenho
Bash/navegador. A busca textual (grep/file-search) **não indexou este repo** nesta sessão
(retornou "sem resultados" para arquivos que existem e li por caminho direto) — então, como na
r3, **não afirmo "só estes lugares usam X"**; confirmei por leitura direta dos arquivos citados,
não por varredura exaustiva.

## Promessa (do conjunto)
"Eu vejo meus add-ons, adiciono um ao plano com um toque e sei na hora se deu certo, falhou ou
está em andamento — e o que eu acabei de comprar aparece coerente no My plan. E o produto me
fala de erro com **uma** voz, seja na lista, no card ou no fim do onboarding."

## O que está resolvido (não mexer)

- **Os três fixes do buy-flow review HOLD no código atual.** Confirmado em `add-on-card.tsx`:
  1. **Sucesso = botão montado e desabilitado** (VC-3/VC-4). O `<Button>` não é mais trocado
     por `<p>`; em `bought` ele vira `disabled` com check + "Added to your plan". O elemento
     focado sobrevive à transição → foco não órfão. **Sem regressão.**
  2. **Erro tem `role="alert"` + `aria-describedby`** (VC-5). O `<p id={errorId} role="alert">`
     existe, e o botão carrega `aria-describedby={buyStatus === "error" ? errorId : undefined}`.
     A associação mensagem↔botão está certa e o escopo condicional (só em erro) está correto —
     evita um `aria-describedby` pendurado apontando para um id ausente nos outros estados.
     **Sem regressão.**
  3. **Spinner respeita motion** (R-1). O `Loader2` em `busy` tem
     `animate-spin motion-reduce:animate-none`. **Sem regressão.**
- **Sucesso como botão desabilitado mantém o peso visual do card (02, 04).** A queixa do VC-4
  (card comprado "menos acabado" que o card com botão) sumiu: em 02 o card "+1 GB" comprado tem
  o mesmo volume do "+1 GB EU" abaixo, ainda comprável. A escolha (b) do VC-4 foi aplicada e
  funcionou. (Ressalva de contraste do fill esmaecido: ver NEW-1 — é outra coisa.)
- **DreiGo é swap de token limpo (04).** Mesmo card, mesmo layout, roxo #820ad1 no fill e no
  wordmark "3 Go", check de sucesso **verde** (token de sistema, a marca não muda status).
  Prova white-label intacta.
- **O erro É anunciado em toda a jornada, e o retry é condicional a `retryable`.** O
  `SeamErrorNotice` tem `role="alert"` (via `alert.tsx`) e só mostra "Try again" quando
  `error.retryable`. Herdado da r3, continua certo.

---

## Achados

### Bloqueia entrega
Nenhum. Nenhuma das cinco telas impede concluir a compra nem exibe dinheiro ambíguo nesta tela.
O achado de maior impacto é NEW-1 (contraste do sucesso), que rebaixa um estado para ilegível
para parte dos usuários, mas não bloqueia a conclusão da ação — fica no topo de "Vale corrigir".

### Vale corrigir

- **NEW-1 — No sucesso, o botão "Added to your plan" renderiza o fill da marca a 50% de
  opacidade (disabled), e o label branco sobre cyan/roxo esmaecido cai bem abaixo do mínimo —
  em Drei, abaixo até da exceção A1.** _(só visível vendo 02 e 04 como estado, não no idle.)_
  Frase (faz e não percebe / não confia): *"a pessoa com baixa visão, ao comprar, **não
  consegue ler** a própria confirmação — 'Added to your plan' fica branco sobre um cyan lavado,
  e ela não tem certeza se a compra foi registrada."*
  Confirmado no código: `button.tsx` variante `default` não define cor de disabled — herda o
  genérico `disabled:opacity-50` da base do `buttonVariants`. Em `add-on-card.tsx` o estado
  `bought` é `disabled`, então o fill `bg-primary` (Drei cyan #0096c5 / DreiGo roxo #820ad1)
  pinta a **50%** com `text-primary-foreground` branco por cima. Em 02 isso é visível: o botão
  de sucesso é um cyan claramente mais pálido que o "Add to my plan" do card de baixo; em 04 o
  roxo vira lilás claro. A conta: branco sobre cyan cheio já é ~3.3:1 (exceção A1, **escopo =
  botão ativo + hero**, não um botão esmaecido); a 50% de opacidade sobre surface branco o fundo
  clareia para ~#80cbe2 e o branco por cima despenca para **~1.6:1** (Drei) — bem abaixo de
  qualquer piso, e **fora** do guarda-chuva da A1, que não cobre o estado desabilitado. DreiGo a
  50% (~#c0,85,e8) fica em torno de ~2:1 — também reprovado. Não é artefato de captura: é a
  opacity do primitivo cruzando com o fill da marca.
  → **Corrigir o estado de sucesso para não depender de `opacity-50` sobre o fill.** O
  `add-on-card` precisa de um tratamento de "Added" que não seja "o botão primário a meio-tom":
  p. ex. um fill `success-tint` com `text-success` + check (o verde #15703a passa ~5.9:1 no
  tint claro e é o token de sistema certo para "feito"), mantendo o botão montado e
  `disabled`/não-tabulável. Isso resolve o contraste **e** fica semanticamente mais honesto
  ("feito" é status, não "ação primária apagada"). Alternativa mínima: um fill cheio de
  `success`/`accent-ink` com label branco que passe — mas o caminho do tint é o mais aderente à
  régua ("status é cor + palavra"). _Telas: 02, 04. Confirmar os ratios finais com
  `tools/contrast.py`._

- **NEW-2 — O app passou a falar erro em DOIS pesos visuais: caixa `danger-tint` com borda
  (lista + onboarding) vs. uma linha de texto vermelho sem caixa (erro de compra no card).**
  _(só aparece comparando as três superfícies de erro como conjunto.)_
  Frase (contradiz / não confia): *"a mesma pessoa que no onboarding e na lista de add-ons vê o
  erro como um bloco vermelho com moldura, ao falhar uma compra vê só uma frase vermelha solta
  abaixo do botão — **o produto não parece estar falando a mesma língua de erro**, e o erro de
  compra tem menos peso visual que os outros dois."*
  Confirmado no código. Três superfícies:
  1. **Lista de add-ons** (`add-ons.tsx` → `SeamErrorNotice`): `Alert` destructive com
     `bg-danger-tint` + `border-danger` cheia + retry em pílula. Bloco com preenchimento.
  2. **Onboarding terminal/estados** (r3 → `SeamErrorNotice`): **o mesmo** componente. Mesmo
     bloco com tint.
  3. **Compra no card** (`add-on-card.tsx`): `<p role="alert" class="type-caption
     text-destructive">` — texto vermelho de 12px, **sem** tint, **sem** borda, **sem** caixa,
     e o retry é o próprio botão "Add to my plan" reaproveitado.
  Ou seja: duas das três superfícies são idênticas (bom — é o `SeamErrorNotice` único que a r3
  elogiou), e a terceira é um padrão visual diferente. **Tom** e **recuperação** são defensáveis
  nos três (todos dizem o que houve + próximo passo; todos têm caminho de volta), e o erro
  inline de card ser mais leve que um `Alert` de página inteira é até razoável — um `Alert`
  full-bleed dentro de cada card seria pesado demais numa lista. O problema é que hoje a
  diferença é **total** (caixa vs. nenhuma caixa), não graduada. A régua tem um componente para
  exatamente isso: **`notice-banner` danger** (tint + palavra), e o erro de card deveria ser uma
  versão compacta dele, não um `<p>` solto.
  → **Alinhar o erro de compra ao vocabulário de erro do sistema sem transformá-lo num Alert de
  página.** Mínimo: envolver a mensagem num bloco `danger-tint` com `rounded-control` e um ícone
  de alerta, mantendo `role="alert"` e o `aria-describedby` que já existem — um "notice-banner
  compacto". Assim as três superfícies compartilham fundo-tint + palavra + borda, variando só a
  escala, não a existência da caixa. (Não mexer no `SeamErrorNotice`, que já está certo; o ajuste
  é no `add-on-card`.) _Telas: 03 (vs. a lista-erro e vs. o terminal do onboarding da r3._
  _Decisão de peso visual fica para a Tatiana — ver "Preciso saber antes".)_

- **NEW-3 — O `aria-live="polite"` que anuncia o sucesso vive permanentemente no `<Button>`, e
  o sucesso não tem mais um `role="status"` dedicado.** _(nuance de código; impacto em leitor de
  tela.)_
  Frase (faz e não percebe): *"quem usa leitor de tela pode **não ouvir** a confirmação de forma
  confiável — o anúncio depende de um `aria-live` fixo no botão cujo conteúdo inteiro troca
  (idle → busy → added), e trocas sucessivas num live region único podem ser engolidas ou lidas
  pela metade."*
  No `add-on-card.tsx` o `<Button>` carrega `aria-live="polite"` **em todos os estados**, e o
  texto interno muda de "Add to my plan" → "Adding…" → "Added to your plan". Um live region
  permanente cujo label inteiro é reescrito a cada passo é frágil: o `busy` ("Adding…") e o
  `success` ("Added…") disputam o mesmo region em sequência, e `aria-busy` no mesmo nó pode
  alterar como a mudança é exposta. A r3/buy-review pediam o par "sucesso anunciado como o erro
  é" — o erro hoje tem um `role="alert"` próprio (nó dedicado), o sucesso **não tem** um nó
  equivalente, usa o live no controle. Funciona em muitos leitores, mas é menos robusto que um
  nó de status dedicado.
  → **Dar ao sucesso um nó de status dedicado**, como o erro tem: um elemento separado (p. ex.
  um `<span className="sr-only" role="status">` montado só em `bought`) com "Added to your plan",
  e **tirar** o `aria-live` do botão (o botão volta a ser só um controle). Isso espelha a
  simetria sucesso↔erro que as rodadas anteriores pediam e evita o live-region sobrecarregado.
  Não é bloqueio (o texto É visível e o botão fica desabilitado), por isso "vale corrigir", não
  "bloqueia". _Telas: 02, 04 (estado; não medível só pela imagem — confirmar com leitor de tela
  no round de a11y/runtime)._

### Refinamento (preferência declarada)

- **R-1 — "Added to your plan" (sucesso) vs. "Add to my plan" (CTA): my/your continua
  alternando.** Já registrado como preferência no buy-review; **não é novo** e não re-reporto
  como achado — só confirmo que persiste em 02/04 e segue defensável (CTA em 1ª pessoa,
  confirmação falando com você). Se quiserem voz única, "your plan" nos dois. _Telas: 01–04._
- **R-2 — Ritmo entre cards: `gap-3` (12px) entre os `<li>`, mas a régua pede 16px entre cards
  empilhados.** _(visível vendo 01 como lista.)_ `add-ons.tsx` usa `<ul className="grid gap-3">`
  = 12px; o DESIGN.md (Layout) diz "16 px between stacked cards, 12 px inside a grid-2". Cards de
  add-on empilhados são "stacked cards", não grid-2 → deveria ser `gap-4` (16px). É sutil e os
  cards não se tocam, por isso refinamento, não divergência dura — mas é um número fora da
  escala declarada. → `gap-4` na lista. _Tela: 01 (e qualquer lista de cards)._

---

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| **1.4.3 Contraste (texto)** | Sucesso: label branco sobre fill da marca a `opacity-50` → ~1.6:1 (Drei) / ~2:1 (DreiGo), **fora** da exceção A1 (NEW-1). | Trocar o estado "Added" por `success-tint` + `text-success` (passa) ou fill que passe. | **Sim — 1.4.3** (regressão de a11y real) |
| **4.1.3 Status messages (sucesso)** | Sucesso anunciado via `aria-live` fixo no botão cujo label inteiro troca; sem nó `role="status"` dedicado como o erro tem (NEW-3). | Nó `role="status"` sr-only dedicado em `bought`; remover `aria-live` do botão. | Sim — 4.1.3 (fronteiriço; funciona, mas frágil) |
| **4.1.3 Status messages (erro)** | **OK — mantém.** `<p role="alert">` presente e associado via `aria-describedby`. Confirmado, sem regressão. | — | Passa |
| **2.4.3 Focus order** | **OK — mantém.** Sucesso não desmonta o botão focado (VC-3 corrigido). | — | Passa |
| **2.3.3 Animation** | **OK — mantém.** `motion-reduce:animate-none` no spinner (R-1 do buy-review corrigido). | — | Passa (AAA) |
| **1.4.3 (exceção A1, conhecida)** | Botão primário **ativo** cyan + branco ~3.3:1 (01, 03). | Exceção A1 documentada (botão ativo + hero). **Não** cobre o disabled de NEW-1. | Documentar A1 |
| **Consistência de erro (não é critério único)** | Dois pesos visuais de erro (NEW-2) — não fere um critério numérico, mas o erro de card sem tint/borda é a superfície mais fraca. | `notice-banner` compacto no card. | Indireto |

## Estados faltando
- **Busy** e **desqualificado** seguem **não capturados** (mesma observação do buy-review). O
  código os trata (`busy` com spinner+"Adding…"; `unqualified` com opacity-60 + reason). Não
  revisáveis por imagem — recomendo capturar no próximo round, agora com atenção extra ao
  **busy**, porque o mesmo `opacity-50` de disabled que gera NEW-1 **também** se aplica ao botão
  durante `anyBusy` (os outros cards ficam disabled a 50% enquanto um compra) — confirmar que o
  "Add to my plan" esmaecido dos cards vizinhos ainda lê o suficiente, ou se é NEW-1 de novo.
- Concorrência/obsolescência: não se aplica (ação individual sobre a própria base). Correto.

## Carga — o que perguntei e o que ficou sem resposta
- **Quantos add-ons no catálogo real?** Segue em aberto desde o buy-review. `grid` sem teto,
  busca ou agrupamento. Menos agudo que onboarding (add-ons tende a lista curta), mas sem ponto
  de virada desenhado. _(não suspende achado.)_
- **`anyBusy` desabilita TODOS os cards durante uma compra.** Confirmado em `add-on-card`
  (`disabled={… || (anyBusy && !bought)}`). Correto para evitar atribuir o resultado ao card
  errado — mas visualmente, numa lista maior, isso apaga a 50% todos os outros botões ao mesmo
  tempo (ver NEW-1 aplicado ao `busy`). _(informa o risco; decide se o disabled dos vizinhos
  precisa de um tratamento mais legível.)_

## Papéis
Single-role (o próprio cliente autenticado). Sem variante de papel a desenhar. Coerente.

## Aderência ao sistema
Régua: **`design/DESIGN.md`** (nota: vive em `design/`, não em top-level — delegação correta
desta vez).
- **Aderente:** preço-primeiro + `tabular-nums`, card sem shadow, accent como swap de token,
  status verde/vermelho como token de sistema, sucesso agora preserva foco (botão montado),
  erro de compra anunciado e associado, DreiGo swap limpo.
- **Divergência nova:** estado "Added" depende de `opacity-50` sobre o fill → contraste reprovado
  (NEW-1); erro de compra fora do vocabulário `notice-banner`/tint do sistema (NEW-2); `gap-3`
  em vez de 16px entre cards (R-2).
- **Dívida JÁ LOGADA — confirmo que SEGUE EXATA, não re-reporto como nova:**
  - **VC-1 (botão não-pill + `shadow`).** Confirmado em `button.tsx`: `buttonVariants` base tem
    `rounded-md` e a variante `default` tem `shadow`. Nunca sobrescrito no `add-on-card`
    (`className="min-h-11 w-full"` não toca raio nem sombra). Em 01/03 o "Add to my plan" é
    retângulo ~12px com sombra sutil, não pílula. **Ainda preciso e ainda contra a régua**
    ("pill 999 on buttons", "no box-shadow anywhere"). Atravessa onboarding (mesmo `Button`).
  - **VC-2 (44px, não 52px).** Confirmado: `add-on-card` usa `min-h-11` (44px); o DESIGN.md pede
    52px para botão. 44px passa o piso de alvo AA (2.5.8), então é dívida de sistema, não a11y.
    **Segue exata.**
- **Exceção A1** (botão cyan ativo ~3.3:1) presente e esperada — não é divergência. (Mas NÃO
  cobre o disabled — ver NEW-1.)

## Escrita — antes → depois
Strings em en-US; sentence case; um termo por conceito. **Sem achado novo de escrita** — as
quatro strings do buy-flow seguem corretas (dizem o resultado + próximo passo), já validadas no
buy-review. Confirmo que nenhuma mudou.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| Buy CTA (01, 03) | "Add to my plan" | "Add to my plan" ✔ | Nomeia o resultado. Manter. |
| Sucesso (02, 04) | "Added to your plan" | "Added to your plan" ✔ | Sentence case, nomeia o resultado. Manter. |
| Erro (03) | "Couldn't add this add-on. Please try again." | ✔ | O que houve + próximo passo. Problema de 03 é visual (NEW-2), não cópia. |

## My plan após compra (05) — o KNOWN finding (offerId cru)
- **Confirmo a severidade registrada e NÃO re-reporto como novo.** Em 05, "Your products" lista
  `up`, **`drei-addon-1gb`**, `SIM` — offerIds crus (mock de order seta `Product.name =
  offerId`). Já logado como dívida; a triagem anterior ("marginalmente mais grave porque agora
  fecha um fluxo de compra deliberado: a pessoa vê '+1 GB' bonito e reencontra 'drei-addon-1gb'")
  **continua correta** e eu a subscrevo. Nada mudou na natureza: é dívida do mock, corrige-se no
  mapeamento offerId→nome de catálogo, não nesta tela. **Severidade: mantém (dívida alta no
  backlog, não bloqueio da Fase 6).** Não é regressão.
- Observação de continuidade 01→02→05, não achado novo: o "+1 GB" que em 01/02 aparece com
  preço, tagline e confirmação some em 05 virando uma linha `drei-addon-1gb / Active` sem preço
  nem o nome amigável. A quebra nome↔nome é exatamente o que o known finding descreve; só
  registro que o pass de sistema a vê ponta a ponta.

## Build de demo
Não se aplica — produto self-care real. (Se virar demo, `drei-addon-1gb` em 05 é o primeiro
risco de credibilidade, como já observado.)

## Preciso saber antes
- **NEW-2 — qual peso visual o erro de compra deve ter?** Um `notice-banner` compacto com tint
  (alinha ao sistema) ou mantém mais leve que o Alert de página de propósito (porque é inline num
  card de lista)? _Suspende a forma da correção do NEW-2, não o achado — a divergência de "caixa
  vs. nenhuma caixa" vale de qualquer modo; a dúvida é o quanto aproximar._
- **O estado "Added" persiste entre re-qualificações/sessões?** `boughtOfferId` é estado local
  da rota; ao `invalidateQueries` re-qualificar a lista, o card comprado volta a "Add to my
  plan"? Se sim, há caminho para comprar de novo o mesmo add-on. _Não suspende NEW-1/NEW-3;
  decide se o estado "Added" precisa vir de dado (produto possuído), não de estado local._
- **Quantos add-ons no pior caso real?** Define busca/agrupamento e o quanto o `opacity-50` dos
  vizinhos em `anyBusy` incomoda numa lista longa. _Não suspende achado._

## Limites desta revisão
- **Render + código, não runtime.** Li 5 PNGs e 5 arquivos. Não rodei a app, não medi contraste
  por ferramenta — os ratios de NEW-1 (~1.6:1 Drei / ~2:1 DreiGo no disabled) são estimados do
  cruzamento `opacity-50` × fill; **confirmar com `tools/contrast.py`** antes de fechar ACR. O
  que **vi** é que o botão de sucesso é visivelmente mais pálido que o botão ativo (02, 04) — o
  problema existe; o número exato é o que falta medir.
- **Busca textual não indexou o repo** (como na r3): confirmei os arquivos por leitura direta,
  **não** por varredura. NEW-3 e a dívida VC-1 valem para os arquivos lidos; quem for corrigir o
  `Button` (VC-1/VC-2) deve varrer todos os usos antes de dar por completo.
- **Busy e desqualificado não capturados** → NEW-1 aplicado ao `busy`/`anyBusy` e o contraste do
  card a 60% não são confirmáveis por imagem. Capturar no próximo round.
- **Sem link de Figma** → paridade Figma↔código não avaliada.
- **`fixing-accessibility` não roda aqui** (precisa de Bash/edição de HTML): o nó `role=status`
  de NEW-3, o tratamento de contraste de NEW-1 e o notice compacto de NEW-2 ficam para a thread
  principal/`implement`.
- Ordenado por impacto em quem usa: **NEW-1 (sucesso ilegível) é o de maior impacto**, seguido de
  NEW-2 (voz de erro incoerente) e NEW-3 (anúncio de sucesso frágil). Os fixes do buy-flow
  **holdam**; a dívida VC-1/VC-2 e o offerId cru de 05 **seguem exatos** e não são re-reportados.
