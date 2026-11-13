# Customer 360 — próximo passo

As frases curtas ("bom para…") voltaram para todos os planos.

## Como está hoje (vi no navegador, celular, logado como cliente demo)
- **Home:** número + "Ativa", saldo €15,00 válido até 31/dez, anel de dados, cartão do plano, atalho de extras. Funciona, mas:
  - "1,8 GB restantes" aparece em laranja sem a palavra "acabando" — status só com cor (quebra a regra cor + palavra).
  - O cartão do plano não diz quando renova; a data de renovação (8/dez) só aparece em Meu plano.
  - "eSIM/SIM" não aparece ao lado de "Ativa" porque o SIM demo não tem o tipo preenchido.
  - Linha suspensa: hoje o selo some. Deveria dizer "Suspensa" em vermelho com o que fazer.
  - Saldo zerado ou vencido não tem mensagem própria.
- **Meu plano:** tudo num só bloco, sem hierarquia. O plano (nome, preço, renovação) não lidera; o saldo repete a Home; "Ativo" aparece três vezes; franquias sem barra de progresso.

## O que vou fazer
1. **Home**
   - Dados: adicionar a palavra de estado ("Acabando" / "Sem dados") junto da cor.
   - Cartão do plano: mostrar "Renova em 8/dez" no lugar do selo "Ativo" repetido.
   - Selo da linha: "Ativa · eSIM", "Suspensa" (vermelho + link para Suporte) ou "Pendente".
   - Saldo zero: texto "Sem saldo — recarregue para continuar usando" em vez de €0,00 solto.
2. **Meu plano** (reorganizar, sem novas funções)
   - Topo: nome do plano, preço por mês, "Renova em…" e estado (uma vez só).
   - Franquias: cada uma com barra fina de progresso + texto "x de y restantes" (leitor de tela lê o texto).
   - Extras ativos: lista separada; vazio → "Nenhum extra ativo" + link "Ver extras".
   - Sua linha: número (toque para copiar), tipo de SIM.
   - Tirar o saldo daqui (fica na Home e em Recarga).
3. **Dados de teste:** SIM demo com tipo preenchido; um cliente demo suspenso para testar o estado.
4. **Verificar:** Home e Meu plano no celular e no computador, em inglês e alemão, incluindo linha suspensa e saldo baixo.

## Fica para depois
- Botão "ver demonstração" para visitantes na Home.
- Revisão do alemão por nativo.

## Detalhes técnicos
- Nova regra pura `lineStatus(c360)` → `active | suspended | pending` em customer360-rules, com testes.
- Palavra de estado vem de `bucketState` (já existe); só falta renderizar o texto.
- Barra de progresso: componente `Progress` do shadcn, tokens de status existentes; sem sombras/gradientes.
- Textos novos em en-US e de-AT.
