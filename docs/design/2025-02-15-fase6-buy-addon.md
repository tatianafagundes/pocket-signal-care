# Revisão visual + a11y — Comprar add-on (Fase 6)

Revisão **de render** do fluxo "buy add-on" do self-care MVNO white-label, a partir de 5
capturas Playwright a **390×844 (viewport de telefone real)** em
`docs/design/capturas/fase6-buy/`. Régua: **`design/DESIGN.md`** (sistema Fuon adaptado;
marcas Drei cyan e DreiGo roxo). Código lido: `src/components/add-ons/add-on-card.tsx`,
`src/routes/add-ons.tsx`, `src/components/ui/button.tsx`, `src/components/onboarding/wizard-nav.tsx`.
Comparado com a rodada anterior `2025-02-14-onboarding-fase-e-visual.md` (achados BE-1/BE-2).

**Natureza da verificação:** li cada PNG e li o código. O que é hierarquia, espaçamento,
sobreposição, forma e alinhamento eu **vi**. Ratio de contraste exato eu não medi por
ferramenta — uso os valores do próprio `tokens.css`/`DESIGN.md` (que trazem os ratios
calculados à mão) e marco o que não é medível por imagem. Não rodei a app nem editei código
(sem Bash/navegador). Nota de régua: a delegação apontou `~/pocket-signal-care/DESIGN.md`,
que **não existe**; a régua real está em `~/pocket-signal-care/design/DESIGN.md`, dentro do
mesmo repo — é essa que usei. (Há um `DESIGN.md` de outro projeto no OneDrive; **ignorado**.)

## Promessa da tela
"Na minha lista de add-ons, eu vejo o que cada extra faz e quanto custa, adiciono um ao meu
plano com um toque, e sei na hora se deu certo, falhou ou se não posso comprar — sem sair da
lista."

## O que está resolvido (não mexer)
- **Hierarquia nome+preço / tagline / ação está certa nos dois brands (01, 04).** Nome à
  esquerda, preço `tabular-nums` à direita na mesma linha, tagline terciária abaixo, CTA
  depois. "Número primeiro, ação segundo" do DESIGN.md. Preço em `tabular-figures`. Não mexer.
- **BE-1/BE-2 da rodada anterior NÃO reaparecem aqui.** A rodada de onboarding apontou
  app-bar/rodapé fixos cobrindo conteúdo em altura de telefone. Nestas 5 capturas, a 390×844,
  a barra de abas inferior **não** cobre nada — sobra canvas abaixo do card em todos os
  estados. Para esta tela, resolvido. (Não é a mesma tela, então não é prova de correção
  global; é a confirmação de que a tela de add-ons não herda o defeito.)
- **O estado de resultado fica ao lado do controle, sem toast (02, 03, 04).** Para um
  resultado persistente (o add-on passa a ser possuído), confirmação in-place é a escolha
  certa — mais acessível e mais honesta que um toast que some. `role="status"` no sucesso e
  mensagem inline no erro é o padrão correto aqui. Não trocar por toast.
- **O card desqualificado (não capturado, mas no código) sinaliza com cor + palavra + razão.**
  `aria-disabled`, `opacity-60`, e o `reasonText` em texto (não só cor). Aderente ao
  "cor nunca é o único sinal". Não mexer no padrão.
- **DreiGo é um swap de token limpo (04).** Mesmo card, mesmo layout, só accent/wordmark
  mudam (roxo). O check de sucesso continua verde `success` (token de sistema, correto — a
  marca não muda status). Prova a tese white-label. Não mexer.

---

## Achados

### Bloqueia entrega
Nenhum. Nenhum dos 5 estados impede concluir a compra nem exibe dinheiro ambíguo. Os achados
abaixo são de consistência de sistema, foco e cor — nenhum é bloqueio.

### Vale corrigir

- **VC-1 — O botão primário não é pílula e carrega `shadow`; diverge do DESIGN.md em AMBOS os
  brands, e a rodada anterior marcou isso como "aderente" por engano.**
  Frase (contradiz): *"o render **contradiz** o DESIGN.md — 'pill (999) on buttons … 52 px' e
  'null the shadows' — e contradiz a própria revisão anterior, que registrou 'pill nos botões:
  aderente'."*
  O `Button` shadcn (`src/components/ui/button.tsx`) tem `rounded-md` (=12px via alias) e
  `shadow` na variante `default`, e **nunca foram sobrescritos**. Em 01/02/03/04 o "Add to my
  plan" é um retângulo de cantos ~12px, não uma pílula, e tem uma sombra sutil — o DESIGN.md é
  explícito: botões são **pill 999** (primário e secundário, Drei e DreiGo) e **"there is no
  box-shadow anywhere"**. Isto não é artefato de captura: está no código.
  → **Corrigir no `Button`** (ou numa variante do design system): `rounded-full`, remover
  `shadow`/`shadow-sm` das variantes, e altura alvo 52px (ver VC-2). Como o mesmo `Button` é o
  "Continue" do onboarding, a correção conserta os dois de uma vez — mas confirme que nenhuma
  outra tela dependia do retângulo. _Telas: 01, 02, 03, 04 (e todo uso de `<Button>`)._

- **VC-2 — Altura do botão é `min-h-11` (44px), não os 52px que o DESIGN.md pede para botões.**
  Frase (contradiz): *"o render **contradiz** o DESIGN.md — 'Tap targets 44 px minimum;
  buttons 52 px'."*
  Tanto o Buy (`add-on-card.tsx`) quanto o Continue (`wizard-nav.tsx`) usam `min-h-11` = 44px.
  44px satisfaz o **piso de alvo** (WCAG 2.5.8 AA = 24px; 44px é meta de toque), então **não é
  achado de acessibilidade** — é divergência de sistema: o DESIGN.md separa "alvo mínimo 44"
  de "botão 52". O Buy é **consistente com o Continue** (resposta direta à sua pergunta: sim,
  mesmo tratamento — mesmo `<Button>`, mesmo `min-h-11`, mesma ausência de pill), mas ambos
  estão 8px abaixo do botão de 52 do sistema. → Elevar o botão primário para `h-13`/52px (ou o
  token de controle), de novo no `Button`, não no call-site. _Telas: 01, 02, 03, 04._

- **VC-3 — Na transição sucesso, o foco se perde: o `<Button>` focado é desmontado e trocado
  por um `<p role="status">` não-focável.**
  Frase (faz e não percebe): *"a pessoa que comprou pelo teclado/leitor de tela, ao ter
  sucesso, **perde o foco** — o botão que ela acabou de acionar some e o foco cai no `<body>`;
  ela não é levada ao texto 'Added to your plan' nem sabe para onde ir."*
  No `add-on-card.tsx`, em `bought` o `<Button>` é substituído por um `<p role=status>`. O
  `role="status"` **anuncia** o texto (bom, aria-live educado), mas o **foco** fica órfão: o
  elemento ativo foi removido do DOM. Em 02 o próximo foco tabulável seria o "More info" do
  mesmo card ou o Buy do card de baixo — não determinístico, e um salto de contexto. É o caso
  clássico do 2.4.3 / 3.2.x que a sua pergunta levantou. → Opções: (a) manter o foco movendo-o
  programaticamente para o container do resultado (`tabindex=-1` + `.focus()` no `<p>`), ou
  (b) **não desmontar o botão** — transformá-lo em estado "Added" desabilitado (ver VC-4), o
  que preserva o foco naturalmente. Recomendo (b): resolve foco e semântica juntos. _Tela: 02._

- **VC-4 — Substituir o botão por texto no sucesso apaga a affordance; um botão "Added"
  desabilitado seria mais claro e resolveria o foco (VC-3).**
  Frase (preferência com base objetiva): o padrão atual (botão → texto) é defensável, mas o
  texto `type-caption` verde é visualmente **mais leve** que o botão cheio que ocupava aquele
  espaço — em 02, o card comprado parece "menos acabado" que o card de baixo ainda com botão.
  Um botão desabilitado no estado "Added" (fill esmaecido + check + label) mantém o peso visual
  do card, preserva o foco (VC-3) e comunica "feito, e já era aqui" sem precisar de
  `role=status` para o foco. Contrapartida honesta: um botão desabilitado some do tab order
  (não é mais acionável), o que é correto — nada mais a fazer ali. → **Responde sua pergunta:**
  prefira o botão "Added" desabilitado ao texto, principalmente por causa do VC-3. Se mantiver
  o texto, então o VC-3 vira obrigatório (mover o foco). _Tela: 02, 04._

- **VC-5 — Erro: só a cor vermelha + o texto carregam o estado; o botão de retry não muda
  nada e não há relação programática entre a mensagem e o botão.**
  Frase (não percebe / não confia): *"a pessoa que falhou **pode não perceber** que o próprio
  'Add to my plan' é o retry — a mensagem diz 'Please try again' mas não há um 'Try again', e
  o botão ao lado parece o mesmo de antes de tentar."*
  Em 03, o texto `text-destructive` "Couldn't add this add-on. Please try again." aparece
  **abaixo** do botão, e o botão continua "Add to my plan" idêntico ao idle. Funciona (reusar
  o Buy como retry é aceitável — sua pergunta), mas duas arestas: (1) a mensagem de erro não é
  anunciada — é um `<p>` simples, **sem `role="alert"`/`aria-live`**, então quem usa leitor de
  tela não ouve que falhou (contraste com o sucesso, que tem `role=status`); (2) a mensagem não
  está associada ao botão (`aria-describedby`), então no foco do botão o motivo não é lido.
  → (a) Envolver a mensagem de erro em `role="alert"` (ou `aria-live="assertive"`) — é o
  parceiro do `role=status` do sucesso; (b) `aria-describedby` do botão apontando para o id da
  mensagem; reusar o botão como retry pode ficar, mas aí o label idle "Add to my plan" está ok.
  _Tela: 03._

### Refinamento (preferência declarada)

- **R-1 — O spinner `animate-spin` não respeita `prefers-reduced-motion`.** O `Loader2` em
  `busy` gira via `animate-spin` (tw-animate-css). Não vi no código um guard de
  `motion-reduce:`. Para quem pede movimento reduzido, um spinner contínuo é desconfortável.
  Não é bloqueio (2.3.3 Animation from Interactions é **AAA**, não AA), por isso é refinamento.
  → `motion-reduce:animate-none` no `Loader2`, ou trocar por um pulse/opacidade. O `aria-busy`
  + "Adding…" já cobrem a semântica; é só o conforto visual. _Tela: estado busy (não capturado)._
- **R-2 — O check de sucesso é `h-4 w-4` em `type-caption`; some um pouco ao lado do texto
  (02, 04).** Lê bem, mas o conjunto "check + Added to your plan" tem peso de legenda, não de
  confirmação. Se mantiver o padrão-texto (contra VC-4), considerar `type-body-sm-strong` para
  o sucesso ganhar presença proporcional ao que era um botão cheio. Preferência. _Tela: 02, 04._

---

## Acessibilidade — WCAG 2.2 AA
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| **2.4.3 Focus order / 3.2 Context** | Sucesso desmonta o `<Button>` focado e o substitui por `<p>` não-focável → foco órfão (VC-3). | Mover foco ao resultado, ou não desmontar (botão "Added" desabilitado, VC-4). | Sim — 2.4.3 |
| **4.1.3 Status messages (erro)** | A mensagem de erro é um `<p>` sem `role`/`aria-live` (VC-5); o sucesso tem `role=status`, o erro não tem par. | `role="alert"` (ou `aria-live="assertive"`) na mensagem de erro. | Sim — 4.1.3 |
| **1.3.1 Info & relationships** | Mensagem de erro não associada ao botão de retry (VC-5). | `aria-describedby` do botão → id da mensagem. | Sim — 1.3.1 |
| **1.4.3 Contraste (texto) — sucesso** | `text-success` #15703a sobre surface branco. **Passa:** o DESIGN.md/tokens dão #15703a como status de sistema; #15703a em #fff ≈ 5.9:1 (>4.5). **Não é achado** — confirma sua pergunta: contraste adequado. | Nenhuma ação; manter. | Não (passa) |
| **1.4.3 Contraste — erro** | `text-destructive` = `danger` #c2281f em #fff ≈ 4.8:1 (>4.5). Passa. | Nenhuma ação. | Não (passa) |
| **1.4.3 Contraste — botão primário (A1)** | Label branco em cyan #0096c5 ≈ 3.3:1 (01–03). | **Exceção A1 documentada** (botão + hero). Não é achado novo; num ACR entra como "partially supports" com a justificativa A1. DreiGo (roxo, ~5.6:1) passa. | Sim — documentar A1 |
| **2.3.3 Animation (spinner)** | `animate-spin` sem `motion-reduce` (R-1). | `motion-reduce:animate-none`. **AAA**, não AA — refinamento. | Opcional (AAA) |
| **2.5.8 Target size (AA=24px)** | Botão 44px (`min-h-11`), "More info" `min-h-11`. **Passam o piso AA com folga.** O alvo de 52px do DESIGN.md é meta de produto, não AA (VC-2). | Nenhuma por AA; VC-2 é divergência de sistema. | Não (passa AA) |
| **1.4.1 Use of color (erro)** | Erro é vermelho + **texto** ("Couldn't add…") — não é só cor. Passa. Mas sem o `role=alert` (acima) o texto não é anunciado. | Cobrir com 4.1.3 (VC-5). | Parcial — via 4.1.3 |

Resumo das suas 4 perguntas de a11y: **foco pós-sucesso = problema real (VC-3)**; **spinner
reduced-motion = refinamento AAA (R-1)**; **tamanhos de alvo = ok (passam AA, VC-2 é sistema)**;
**sinal só por cor = ok no sucesso e no erro (ambos têm palavra), mas o erro não é anunciado
(VC-5)**.

## Estados faltando (no que foi capturado)
- **Busy** não foi capturado (só descrito no código: `aria-busy` + `Loader2` + "Adding…"). Não
  dá para revisar o render do spinner — ver R-1. Recomendo capturá-lo no próximo round.
- **Desqualificado** (saldo insuficiente) não foi capturado; o código trata (opacity-60 +
  reason + disabled). Capturar para confirmar o contraste do texto esmaecido no card a 60%.
- Estados de concorrência/obsolescência **não se aplicam** aqui: comprar um add-on é uma ação
  do próprio usuário sobre a própria base instalada; não há recálculo de preço na tela nem
  edição concorrente. (Diferente de uma tela de cotação — aqui a ausência é correta.)

## Carga — o que perguntei e o que ficou sem resposta
- **Quantos add-ons?** 2 (Drei) / 1 (DreiGo) no render. A lista é um `grid gap-3` simples sem
  teto, busca ou agrupamento. Para o catálogo real com "muitas ofertas", não há ponto de
  virada desenhado — mesmo alerta da rodada anterior (VC-1 de onboarding), mas aqui é menos
  agudo (add-ons tende a ser lista curta). _Em aberto: quantos add-ons no pior caso real?_
- **Custo de ida ao servidor na compra.** `purchaseAddOn` = createCart → addItem → submitOrder
  (3 chamadas encadeadas). O estado `busy` cobre a espera (bom). **Não há dinheiro recalculado
  na tela** durante a espera, então não há risco de "número velho exibido como novo" aqui — o
  preço do add-on é estático. Correto. _Sem achado de dinheiro-obsoleto nesta tela._
- **Duas pessoas ao mesmo tempo?** Não aplicável (ação individual na própria conta).

## Papéis
Single-role (o próprio cliente prepaid, autenticado no self-care). Nenhum papel adicional
(agente, admin) usa esta tela. Coerente — sem variante de papel a desenhar.

## Aderência ao sistema
Régua: **`~/pocket-signal-care/design/DESIGN.md`** (marcas Drei e DreiGo).
- **Aderentes:** preço-primeiro, `tabular-nums` no preço, hairline + no-shadow **no card**,
  accent como swap de token entre brands, status verde/vermelho como token de sistema (não
  mudado pela marca), cor + palavra em sucesso e erro, `focus-ring` no disclosure "More info".
- **Divergência real (código, não captura):** **o botão não é pill e tem `shadow`** (VC-1) e
  **tem 44px, não 52px** (VC-2). A sombra também contradiz o "no box-shadow anywhere" — embora
  nos cards a regra esteja respeitada, o botão a quebra. A rodada anterior marcou "pill nos
  botões: aderente" — isso estava **errado** e fica corrigido aqui.
- **Exceção A1** (botão cyan ~3.3:1) presente e esperada — não é divergência.

## Escrita — antes → depois
Strings vão para o produto em **en-US**; sentence case; um termo por conceito.

| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| Buy CTA (01–04) | "Add to my plan" | "Add to my plan" ✔ | Nomeia o resultado, não a mecânica; coerente com o conceito "add-on". Manter. |
| Sucesso (02, 04) | "Added to your plan" | "Added to your plan" ✔ | Sentence case, nomeia o resultado. Manter. |
| Busy (código) | "Adding…" | "Adding…" ✔ | Ok. Manter. |
| Erro (03) | "Couldn't add this add-on. Please try again." | "Couldn't add this add-on. Please try again." ✔ | Diz o que houve **e** o próximo passo. O problema do erro é a11y (VC-5), não a cópia. |

Consistência de termo: "plan"/"add-on" usados de forma coerente entre Buy ("my plan"),
sucesso ("your plan") e My plan. Micro-observação, não achado: "my plan" vs "your plan" entre
o CTA e a confirmação — defensável (o CTA é 1ª pessoa, a confirmação fala com você), mas se
quiser um só registro de voz, alinhe para "your plan" nos dois. Preferência.

## My plan após compra (05) — o KNOWN finding
- **Confirmo o achado e NÃO o re-reporto como novo.** Em 05, "Your products" lista `up`,
  `drei-addon-1gb`, `SIM` — offerIds crus, porque o mock de order seta `Product.name = offerId`.
  É pré-existente (atinge plano e SIM também), e você o está logando como dívida, não
  corrigindo nesta fase. Triagem: **correto tratar como dívida** — não é regressão desta fase.
- **A compra do add-on MUDA a severidade da chamada? Sim, marginalmente — e para cima.** Antes
  da Fase 6, `up` e `SIM` eram nomes crus que o usuário nunca tinha "acabado de criar". Agora o
  usuário **acabou de ver** "Added to your plan" num card bonito chamado "+1 GB" e, segundos
  depois, encontra aquele mesmo item em My plan como `drei-addon-1gb`. O add-on torna o defeito
  **mais visível e mais confuso** porque quebra a continuidade nome↔nome logo após uma ação
  deliberada: *"a pessoa, ao conferir em My plan o add-on que acabou de comprar, **não
  reconhece** 'drei-addon-1gb' como o '+1 GB' que adicionou."* Continua sendo dívida (não
  bloqueia a Fase 6), mas eu subiria a prioridade dela no backlog: a Fase 6 transformou um
  nome-feio-que-ninguém-olha num nome-feio-no-fim-de-um-fluxo-de-compra. A correção é no mock
  de order (mapear offerId→nome de catálogo), não nesta tela.

## Preciso saber antes
- **Quantos add-ons no catálogo real?** Define se a lista precisa de busca/agrupamento. _(não
  suspende nenhum achado; informa o risco de carga.)_
- **O estado "Added" deve permanecer entre sessões/re-render?** O `boughtOfferId` é estado
  local do componente de rota; ao re-qualificar a lista, o add-on comprado volta a mostrar
  "Add to my plan"? Se sim, há um segundo caminho onde o usuário pode comprar de novo. _(não
  suspende, mas decide se VC-4 "Added desabilitado" precisa vir de dado, não de estado local.)_

## Build de demo
Não se aplica — é produto self-care real, não uma build de apresentação. (Se virar demo, os
offerIds crus de 05 seriam o primeiro risco de credibilidade — ver o KNOWN finding.)

## Limites desta revisão
- **Verifiquei render + código, não runtime.** Li as 5 PNGs e os 4 arquivos de código. Não
  rodei a app, não tenho Bash/navegador, não medi contraste por ferramenta — usei os ratios do
  `tokens.css`/`DESIGN.md`. Os contrastes de sucesso (#15703a) e erro (#c2281f) os dei como
  "passa" com base nesses valores publicados; reconfirmar com `tools/contrast.py` se for para
  um ACR.
- **Estados busy e desqualificado não foram capturados** — R-1 (spinner) e o contraste do card
  a 60% não são revisáveis por imagem. Recomendo capturá-los no próximo round.
- **VC-1/VC-2/VC-3/VC-5 são achados de código** (forma do botão, sombra, altura, foco, `role`),
  confirmados na fonte — não são artefato de captura.
- **Sem link de Figma** → paridade Figma↔código: não avaliada.
- **`fixing-accessibility` não roda aqui** (precisa de Bash/edição de HTML): as correções de
  foco (VC-3), `role=alert` (VC-5) e `aria-describedby` ficam para a thread principal/`implement`.
- Achados ordenados por impacto em quem usa. Nenhum bloqueio; VC-3 e VC-5 (foco + anúncio de
  erro) são os de maior impacto real; VC-1/VC-2 são dívida de sistema que atravessa o onboarding.
