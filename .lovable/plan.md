# Revisão da avaliação do Customer 360

## O que a avaliação acerta (manter)
- O número da linha não aparece em lugar nenhum fora do onboarding. Confirmado: o dado existe, mas nenhuma tela mostra.
- O alerta de renovação com o valor que falta ("Recarregue €9,90 para renovar o up M em 1/dez") é o padrão mais útil em pré-pago e é a melhor ideia do documento.
- As regras de design (botão em tinta, sem sombra, status com cor + palavra, sem maiúsculas) estão descritas corretamente.

## Onde a avaliação erra ou exagera
- **Contexto de mercado errado:** cita "Pix" e recarga em caixa, que são coisas do Brasil. Drei/DreiGo são da Áustria: lá as recargas são por cartão, voucher (Wertkarte) e Apple/Google Pay.
- **"Sem login" é uma decisão, não um defeito:** mostrar o cliente demo na Home para quem não entrou confundiria um visitante real. O certo é manter a Home de visitante e oferecer um "ver demonstração" separado.
- **Data de validade x data de renovação:** o modelo hoje só tem uma data de validade. Mostrar duas datas exige um campo novo de renovação nos dados de teste — o documento assume que esse campo já existe.
- **Tela carregada demais:** saudação + aviso + saldo + 3 botões de valor + 2 cartões + franquias + atalhos. Isso desmente o argumento de "entender em 2 segundos". Com estilo Apple seria: uma tela principal com saldo e dados, e o resto em "Meu plano".
- **Botões de valor rápido (+€10/€15/€20) na Home** duplicam a aba Recarga. Melhor: um único "Recarregar €9,90" no aviso de renovação, já com o valor que falta.
- **Benchmarks citados sem fonte** (Google Fi e Mint são pós-pago ou EUA). Faltam referências locais: Magenta, Spusu, HoT, yesss!.
- **Faltou:** acessibilidade dos anéis de progresso (texto para leitor de tela), português/alemão no formato do número (+43), estados de carregando/erro/vazio, linha suspensa ou expirada e o que acontece com saldo zero.

## Proposta revisada
Home (resposta rápida):
1. Saudação + número da linha (toque para copiar) + "Ativa · eSIM".
2. Aviso de renovação só quando o saldo não cobre o plano, com botão "Recarregar €X".
3. Saldo grande + válido até.
4. Dados restantes + plano e data de renovação, num só cartão.

Meu plano (detalhe):
- Todas as franquias (voz, SMS, roaming UE com política de uso justo), extras ativos, detalhes do SIM/eSIM.

## Detalhes técnicos
- Regra pura nova `renewalShortfall(balance, planPrice)` em customer360-rules, com testes (saldo < preço, igual, maior).
- Adicionar `renewsAt` opcional ao modelo e aos dados de teste; se ausente, esconder a linha de renovação.
- `formatMsisdn` reutilizado; copiar com aviso "Número copiado".
- Todos os textos novos em en-US e de-AT.
