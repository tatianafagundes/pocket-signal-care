# BSS Billing / BIH (Ericsson Billing) — Nota de escopo

> **TL;DR:** estas 8 APIs são a camada **southbound de billing** do DXP (Ericsson Billing via
> Billing Integration Hub). Para a nossa demo self-care **prepaid**, o cliente **nunca** fala com
> elas — fala com o CPR, que federa. **Quase todas estão fora de escopo da Fase 5.** Versionadas
> no repo como referência da Fase 8; não têm KB completo de propósito (não justificam o esforço
> para a demo). A exceção útil é a **TMF666**, que fecha o nosso ponto em aberto do Billing Account.

## Fonte

- **Pasta:** `contracts/dxp-reference/bss-billing-bih/` (8 YAMLs OpenAPI)
- Origem: `openApiSpecs_EB_BIH_TMF_APIs.zip` — **EB** = Ericsson Billing, **BIH** = Billing
  Integration Hub. São as REST interfaces BSS do billing stack.

## As 8 APIs e por que (não) precisamos

| API | `info.version` | Precisamos na Fase 5? | Papel |
|---|---|---|---|
| **BSS TMF632 Party Management** | 1.0.0 | Indireto (valida CPR) | Southbound do nosso `createParty`. `/individual`, `/organization`. O CPR mapeia o nosso Party canônico para isto. |
| **BSS TMF629 Customer Management** | 1.0.0 | Indireto (valida CPR) | Southbound do nosso `createCustomer`. `/customer`. **Confirma:** `Customer` não exige `billingAccount` (ver abaixo). |
| **BSS TMF666 Account Management** | 1.0.0 | **Não — mas fecha o ponto em aberto** | Billing Account (`/billingAccount`). Entidade **separada** do customer. Ver "ponto do billing account". |
| **BSS TMF678 Customer Bill Management** | 1.0.0 | Não | Faturas (`/customerBill`). Prepaid não fatura — é wallet de saldo (charging). Fora de escopo. |
| **BSS TMF676 Payment Management** | 1.0.0 | Não nesta fase | Pagamentos/refunds (`/payment`, `/refund`). O onboarding não cobra (saldo inicial `null`; recarga depois). Relevante só p/ top-up real. |
| **BSS TMF670 Payment Methods** | 1.0.0 | Não nesta fase | Métodos de pagamento salvos. Idem — só se houver pagamento real. |
| **BSS TMF635 Usage Management** | 1.0.0 | Não | Eventos de consumo (CDRs). Telemetria de uso, não onboarding. |
| **BSS Reference Data Management** | 1.0.0 | Não | Dados de referência (bancos, áreas, address roles). Infra de billing. |

## O que isto nos ENSINA (confirma a arquitetura)

O fato de **todas** serem BSS/billing confirma a distinção que já está na spec: o nosso app
**prepaid** conversa com **CPR + Charging (wallet) + Catalog + Order + Resource**, e **não** com o
stack de billing (Account / Bill / Payment / Usage). Isto é a fronteira prepaid-vs-postpaid.
Nenhuma destas 8 é um seam novo para o onboarding.

## Ponto do Billing Account — resolvido (baixo risco)

A fase anterior tinha um **ponto em aberto**: o fluxo SLCM prepaid real mostra "Create Billing
Account", mas a HLD diz "prepaid sem billing". Estas APIs **esclarecem**:

- No **BSS TMF629 Customer**, o schema `Customer`/`CustomerCreate` **não tem** campo
  `billingAccount` e **não** o exige. Criar customer **não** obriga billing account. _(verificado)_
- O **Billing Account é uma entidade separada** (BSS TMF666, `POST /billingAccount`), criada por
  um passo próprio — não uma dependência do customer.

**Conclusão (confiança alta agora):** billing account pertence ao mundo **billing full-stack
(postpaid / DMP Evolved)**. No nosso cenário **prepaid puro (DXP + Ericsson Charging)**, não é
criado — o "saldo" é o wallet de charging, não uma conta de faturamento. A decisão da spec
("prepaid sem Billing Account") está **correta e agora bem fundamentada**; o "Create Billing
Account" do fluxo SLCM é um passo do contexto full-stack, opcional para nós. Rebaixado de
"ponto em aberto" para **dívida de confirmação de deployment** (só importa se o alvo for DMP
Evolved full-stack).

## Dívidas Fase 8 (se/quando)

- **TMF632/629** — usar para validar o mapeamento do `cpr-http` (nosso canônico ↔ BSS Party/Customer).
- **TMF676/670** — só entram se fizermos **top-up/pagamento real** (não é o onboarding).
- **TMF666/678/635/ReferenceData** — billing postpaid / faturas / usage; fora do prepaid self-care.
- Não construir seam para nenhuma destas agora. São southbound do CPR, não portas da nossa UI.
