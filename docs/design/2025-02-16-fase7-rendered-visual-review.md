# Fase 7 — revisão VISUAL de telas renderizadas (onboarding: SIM/eSIM · endereço · pagamento · success)

> Primeira revisão **com screenshots reais** (antes era só source). Capturas em
> `docs/captures/fase7/*.png`, 390×844 @2x, host brand **Drei** (cyan), locale en-US.
> Régua: `design/DESIGN.md` (confirmada como a régua deste projeto). Rodadas anteriores lidas e
> usadas: `2025-02-16-fase7-plan-review.md` (B1–B4, S1–S5) e
> `2025-02-16-fase7_5-sim-delivery-payment-review.md` (revisão de source que deixou achados
> **suspensos até ver o render** — esta passada confirma ou derruba cada um).
> Não há link de Figma → **paridade Figma↔código não avaliada**. Não rodei o app; inspecionei
> as imagens entregues.
>
> **Mock debt declarada (NÃO é achado):** ausência de QR real, PSP/3DS real, títulos
> whitelabel placeholder, captura síncrona. Separada dos achados visuais reais abaixo.

## Promessa da tela
"Escolha físico ou eSIM; confirme um pedido onde o dinheiro é **autorizado hoje**, **cobrado**
no marco (SIM despacha / eSIM pronto) e **creditado** como saldo quando a linha ativa — e veja
isso como uma linha do tempo, não três cobranças de hoje; se o eSIM, instale agora."

## O que está resolvido (não mexer — e o que REGREDIU de volta ao bom)

Três dos achados mais pesados das rodadas de source **se confirmam resolvidos no render**:

- **B1-regressão do eSIM FECHADA (era o único blocker da 7.5).** `esim-09-success.png`: o card
  "Your eSIM" entrega exatamente os caminhos que a tela tem — "On this phone, tap to install:
  **Install eSIM**" (link) e "Or enter the activation code below" com o código
  `LPA:1$smdp.drei.at$BF030D21` num chip. **Sem QR fantasma, sem "we emailed you", sem lista
  numerada de 3 caminhos que a tela não cumpre.** O card parece completo e confiável.
- **B1 do dinheiro CONFIRMADA no render — a timeline lê como timeline.** `esim-09`/`phys-09`:
  "Authorized" = **círculo cheio cyan + check branco**; "Charged when your SIM ships / eSIM is
  ready" e "Added when your line is active" = **círculos vazados (hollow)**. Um feito, dois a
  caminho, à primeira vista. Nenhum "today" nos três. A distinção cheio↔vazado lê claramente.
- **S3 da recusa CONFIRMADA no render.** `decl-10-review-declined.png`: "Your card was declined.
  Try another card." em pill `danger-tint` **logo abaixo do campo do cartão** (field-level, não
  banner de topo), cópia já corrigida (sem "check the number"), e **"Place order" segue
  acessível** no rodapé. Erro recuperável, não catástrofe de página. Exatamente o S3.

Também bom e a não mexer:
- **B2/B3 do dinheiro no review** (`esim-08`/`phys-08`): "Plan · first top-up €9.90" (peso
  secundário) e "Authorized today €9.90" (bold), **mesmo número rotulado duas vezes, sem soma**,
  com a nota "What you authorize today becomes your first balance. We only charge it when your
  plan is ready." logo abaixo. Lê como UM valor com propósito, não €9,90 + €9,90 = €19,80.
- **Seleção do SIM lê claramente** (`esim-02`, `phys-02`): card selecionado = borda 2px accent +
  radio dot preenchido; o não-selecionado fica branco. A escolha é inequívoca.
- **Consistência de marca** — wordmark "3" no mesmo lugar nas 22 telas; toggle EN/DE no mesmo
  canto; botão primário cyan pill; stepper em cyan. Nada off-brand.
- **Dados de demo plausíveis** — Mia Berg, mia.berg@example.at, Rennweg 97 / Wien / 1030 / AT,
  +43 681 4000 000x. Crível para uma plateia austríaca.

---

## Achados

### Bloqueia entrega
Nenhum. Os blockers das rodadas de source estão fechados no render (ver acima).

### Vale corrigir

- **V1 · Código de ativação do eSIM em cyan sobre accent-tint — a MENOR legibilidade da tela
  inteira, num texto que o cliente tem de transcrever caractere a caractere.** `esim-09-success.png`.
  Frase: *o cliente de eSIM que não usa o link e vai digitar `LPA:1$smdp.drei.at$BF030D21` nas
  configurações do telefone **faz errado e não percebe** — lê o código em cyan monoespaçado sobre
  o tint cyan claro `#e0f3fa`, o menor contraste da tela, e confunde 0/O/D/B.* A régua é
  explícita: *"Text on accent-tint is text-primary, never accent."* O código é dado técnico que
  cai justamente na exceção que o DESIGN.md proíbe. → Trocar o texto do código para
  `text-primary #1f1f1f` sobre o `accent-tint` (mantendo o chip tint como fundo). Confirmar o
  rácio com `tools/contrast.py`. Isto fecha a linha que a 7.5 deixou "a confirmar". Num ACR
  (EN 301 549 / WCAG 1.4.3) é texto abaixo de 4.5:1 — resposta de RFP, não higiene.

- **V2 · `/addons` mostra dois blocos de tint vazios, sem rótulo e sem conteúdo, com o primário
  dizendo "Skip" — lê como tela quebrada.** `esim-03-addons.png` = `decl-03-addons.png` (idêntico,
  então é estado consistente, não glitch de uma captura). Frase: *quem chega em "Add extras" vê
  dois retângulos azuis vazios dentro do card e um botão "Skip"; **não confia** no que a tela diz
  — não sabe se são add-ons que não carregaram, se a tela travou, ou se é para pular mesmo.* Se o
  catálogo de add-ons está vazio no mock, isto deveria ser um **empty state** ("No extras
  available right now — you can add them later"), não dois blocos de skeleton-tint parados. Se é
  skeleton de loading, não deveria ser o frame em repouso capturado. A régua diz que skeleton
  nunca mostra valor e não é estado final. → Decidir: empty state honesto (preferível) **ou**
  skeleton que não seja o estado de descanso. Ver "Preciso saber antes".

- **V3 · Formato do stepper diverge na tela de plano.** `esim-01-plan.png` diz **"Step 2 · Choose
  a plan"** (sem "of N"); todas as outras dizem "Step N of 7/8" (`esim-02` "Step 3 of 7",
  `esim-04` "Step 5 of 7", `phys-06` "Step 7 of 8"). Frase (contradiz): *o label do passo de plano
  **contradiz** o padrão "Step N of M" de todos os outros passos do mesmo fluxo.* → Padronizar o
  plano para "Step N of M" como os demais. Barato; é coerência de um mesmo stepper.

### Refinamento (preferência declarada)

- **R1 · (preferência) Card selecionado sem o wash accent-tint do padrão option-row.** `esim-02`,
  `phys-02`: a régua pede "accent-ink ring + dot + **accent-tint wash**" para selecionado. O
  render tem borda 2px + dot, **sem o wash**. A seleção já lê clara (borda + dot são sinal
  redundante), então é preferência de aderência ao padrão escrito, não bloqueio. Adicionar
  `has-[[data-state=checked]]:bg-accent-tint` se quiser bater 1:1 com o DESIGN.md. (Herdado da
  7.5; segue valendo no render.)

- **R2 · (preferência) País exibido como "AT" cru.** `phys-06-delivery.png`: o campo Country
  mostra o código ISO "AT", não "Austria". Caso-base EUA declarado, mock — aceitável. Quando Drei
  validar o de-AT, um nome de país legível (ou select com rótulo) lê melhor que o código.

- **R3 · (preferência) Título "Where should we ship your SIM?" quebra em duas linhas.**
  `phys-06-delivery.png`: quebra limpa ("…ship your / SIM?"), sem clip nem órfão mal colocado, no
  estilo `title` 24px. Funciona. Se incomodar, encurtar para "Where should we ship it?" (o
  subtítulo já diz "your physical SIM"). Não é defeito.

---

## Acessibilidade — WCAG 2.2 AA (o que dá para ver no render)
| Critério | O que está errado | Correção | Aparece num ACR? |
|---|---|---|---|
| 1.4.3 Contrast (minimum) | V1: código de ativação em cyan sobre accent-tint — texto crítico abaixo de 4.5:1 | `text-primary` sobre o tint; confirmar com `tools/contrast.py` | **Sim** |
| 1.4.3 / A1 (exceção conhecida) | botão primário cyan + label branco ~3.3:1 (`esim-02`, review, success) | **não é achado** — exceção A1 registrada no DESIGN.md, escopada a botão+hero | Sim (declarado) |
| 1.4.3 (a confirmar) | links "Change"/"Install eSIM"/"More info" parecem cyan **claro** `#0096c5` (~3.3:1), não o `accent-ink #0073a0` (~4.6:1) que a régua exige para link | confirmar no CSS qual token o link usa; se for o claro, trocar p/ accent-ink | **Sim** |
| 1.3.1 / 1.4.1 (timeline) | success: done/upcoming distingue por círculo cheio↔vazado; confirmar que há palavra de estado para AT (o check é decorativo) | `sr-only` "Done"/"Upcoming" por linha (S1 da 7.5, não verificável em imagem) | Sim |
| 2.5.8 / 2.5.5 Target size | não medido em pixel na imagem; radios usam a label-row inteira (parece ≥44) | medir no DOM | — |
| 2.4.7 Focus visible | ring violeta do sistema aparece (ver Limites — provável artefato de captura) | — | — |

> **Links em cyan (linha 3 da tabela) é o único ponto de contraste que pode ser um achado real de
> produto, não só do código de ativação.** Em `esim-08`/`decl-10` os cinco "Change", o "Install
> eSIM" (`esim-09`) e "More info"/"Recommended" (`esim-01`) aparecem num cyan que lê como o
> `#0096c5` claro. A régua é taxativa: link usa `accent-ink #0073a0`. Da imagem eu **não consigo
> cravar o hex**; por isso vai como "a confirmar no CSS", não como blocker. Se o token do link for
> o cyan claro, é 1.4.3 em vários lugares de uma vez.

## Estados faltando (do que o render mostra)
- Timeline de dinheiro: done + 2 upcoming presentes e distintos (`esim-09`, `phys-09`). OK.
- Review: empty (primário desabilitado, pale cyan, `esim-07`) e filled (`esim-08`) e declined
  (`decl-10`) presentes e corretos.
- `/addons`: ver V2 — o estado em repouso lê como quebrado; falta um empty/loaded honesto.

## Carga — o que perguntei e o que ficou sem resposta
- Nenhuma tela da Fase 7 é lista longa no render. `/number` tem 5 opções fixas; `/review` é um
  resumo fixo; `/success` uma timeline de 3. Carga não é o risco desta fase.
- Não vi recálculo de total na tela (o valor é o preço do plano, estável) → sem "número velho
  exibido como novo". O risco de dinheiro aqui é só legibilidade (V1), não obsolescência.

## Papéis
Um só: futuro cliente não autenticado. `success` já mostra o ícone de conta no header (sessão
iniciada) — transição correta. Sem papel de operador. Sem achado.

## Aderência ao sistema
- Wordmark num lugar só; cartões sem sombra com hairline; primário cyan pill; um primário por
  tela ("Place order" / "Continue" / "Save address" / "Top up now" com "Maybe later" ghost). OK.
- Divergências do padrão escrito: V1 (texto em accent-tint), R1 (sem wash na seleção). As duas já
  estavam anotadas na 7.5 como "a confirmar"; o render confirma que seguem valendo.

## Escrita — antes → depois (en-US, sentence case)
| Onde | Está (en) | Proposta (en) | Por quê |
|---|---|---|---|
| `esim-04-number.png` subtítulo/nota | "…we'll **hold** it for you." / "keep your number **reserved**" | "we'll **reserve** it for you" / (manter "reserved") | "hold" está na lista de palavras proibidas do DESIGN.md (banida nas telas de dinheiro); aqui é número, não dinheiro, mas "reserve" já é usado na mesma tela — um termo só. Confirmar escopo da proibição. |
| `phys-06` Country | "AT" | "Austria" (ou select rotulado) | R2 — código ISO não é legível para o cliente |

> As duas correções de cópia que a 7.5 pediu (cardDeclined "Try another card." e o card de eSIM
> sem QR/link fantasma) **já aparecem aplicadas no render** — não repito como achado.

## Preciso saber antes
- **`/addons`: o catálogo de add-ons está vazio no mock, ou os dois blocos são skeleton de
  loading?** Suspende a direção de **V2** (empty state honesto vs. skeleton que não é o frame de
  repouso). O estado atual lê como quebrado seja qual for a resposta.
- **O token do `link` no CSS é `accent-ink #0073a0` ou o cyan claro `#0096c5`?** Suspende a linha
  3 da tabela de acessibilidade (os "Change"/"Install eSIM" podem ser 1.4.3 em vários lugares).
  Não dá para cravar o hex pela imagem.
- **O ring violeta visível em repouso (h1 em `esim-01`, confirm-password em `esim-05`,
  postal-code em `phys-06`) é autofocus real do app ou artefato do harness de captura?** Se for
  autofocus de produto pousando num **h1 não interativo** (plano), é achado leve de foco; se é a
  ferramenta focando um elemento antes do shot, é só ruído da captura. Ver Limites.

## Build de demo
Não é uma build de demo roteirizada aqui, mas valendo para apresentação: contraste do **código de
ativação** (V1) é o que mais arrisca credibilidade numa sala/projeção — cyan sobre cyan some num
projetor. Priorizar V1 se isto for ao vivo. Dados falsos plausíveis (bom). Latência real não
verificável em imagem estática.

## Limites desta revisão
- **Imagens estáticas, app não rodado, sem Figma.** Rácios de contraste reais, foco em uso real e
  target-size em pixel não medidos; marcados "a confirmar". Leitura de imagem não é inspeção de DOM.
- **Ring violeta em repouso difere por tela** (um elemento distinto ringed em cada captura, e
  nenhum em `esim-02`/`esim-03`/`esim-04`). O padrão — um elemento diferente a cada shot — é
  típico de **harness de captura** focando antes do screenshot, não defeito de produto. Registrado
  como pergunta, não como achado, para ninguém caçar bug onde pode não haver.
- **Filenames vs conteúdo:** `esim-07-review-empty` mostra o primário desabilitado (pale cyan) e
  `esim-08-review-filled` mostra cartão 4242 + consentimento marcado + "Place order" ativo —
  coerente com os nomes.
- **Hex de cores não extraível da imagem** — todas as conclusões de contraste que dependem de hex
  exato (links cyan, código de ativação, A1) vão como "a confirmar com `tools/contrast.py`".
- Paridade Figma↔código: não avaliada (sem link).
- Mock debt (QR real, PSP/3DS, títulos whitelabel, captura síncrona): **não é achado**.
