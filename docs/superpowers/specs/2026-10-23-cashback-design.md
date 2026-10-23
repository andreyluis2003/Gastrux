# Cashback — Design

**Data:** 2026-10-23
**Status:** decisões do dono tomadas em chat (4 perguntas); aguardando revisão deste documento
**Origem:** itens 1 e 2 de "Telas que não funcionam" (`docs/pendencias.md`): Fidelidade e Cashback não geram nada,
o CRM nunca soma as vendas, e o site vende "programa de fidelidade" no Business.

## 1. Problema

- Nenhuma venda gera pontos nem cashback. `POST /api/cashback` existe, mas ninguém o chama.
- Há dois programas que se sobrepõem: **Fidelidade** (pontos por real, recompensas, "marcos" que nunca são aplicados)
  e **Cashback** (5% em pontos inteiros de R$ 1, arredondados para baixo: uma conta de R$ 30 dá R$ 1).
- A conta (comanda) não tem cliente: só um nome digitado. O cliente só existe se tiver **e-mail**, e o e-mail é
  único no sistema inteiro (um cliente de duas lojas não pode ser cadastrado nas duas).
- No CRM, "Total gasto", "Total de pedidos", ticket médio e segmento nunca são atualizados.

## 2. Objetivo e critério de sucesso

O caixa digita o celular do cliente ao fechar a conta, o cliente ganha um crédito em reais e, numa próxima conta,
usa esse crédito como desconto. O dono vê no CRM quanto cada cliente comprou.

**Sucesso:**
- fechar uma conta com o celular credita o percentual do dono sobre o valor pago;
- numa próxima conta, o saldo aparece e "Usar cashback" abate do total, até o saldo;
- o crédito vence na validade definida (o mais antigo é usado primeiro);
- a DRE mostra o cashback usado como desconto, sem mudar o total do Caixa;
- a NFC-e sai com o desconto;
- reabrir ou cancelar a conta desfaz o que ela creditou e devolve o que ela usou;
- o CRM mostra total gasto, compras, ticket médio, última compra e segmento de cada cliente.

## 3. Decisões do dono (2026-10-23)

1. **Só cashback, em reais.** A tela Fidelidade sai do menu.
2. **Identificação pelo celular no fechamento** da conta (Vender e venda de balcão), opcional. Celular novo pede o
   nome. No site de delivery, vale o celular do pedido. O e-mail deixa de ser obrigatório.
3. **O crédito é desconto na conta.** Na DRE, receita menor (dedução), não forma de pagamento.
4. **O dono define a regra** na tela Cashback: percentual (padrão 5%), validade (padrão 6 meses), mínimo para usar
   (padrão R$ 10) e um botão para ligar/desligar.

## 4. A confirmar na revisão

- **a. Delivery só acumula nesta etapa.** No site qualquer pessoa digita qualquer celular; sem confirmar quem é
  (código pelo WhatsApp, que espera a verificação da Meta), usar o saldo de outra pessoa seria fácil. No balcão o
  caixa vê o nome do cliente antes de usar.
- **b. Base do crédito:** o valor pago pelos itens, sem a taxa de serviço (é do garçom, Lei 13.419), sem a taxa de
  entrega e sem o próprio cashback usado. Arredondado para baixo em centavos.
- **c. Segmento do CRM:** VIP com 10 compras ou mais nos últimos 90 dias, Regular com 3 a 9, Ocasional com 1 ou 2,
  Inativo sem compra há mais de 90 dias.
- **d. Plano:** cashback no Business (e no teste de 30 dias), como a fidelidade estava. O CRM com os totais em todos
  os planos (o CRM básico já é de todos).

## 5. Fora do escopo

Pontos e recompensas, marcos, indicação (`/api/indicacao`), campanhas por WhatsApp, uso do saldo no site de delivery,
código de confirmação. Os dados antigos de fidelidade (`loyalty_*`) ficam no banco, sem tela.

## 6. Dados

- **Customer:** `email` passa a ser opcional (continua único quando preenchido). Novo `phoneDigits` (só números, com
  DDD), único por restaurante (`@@unique([restaurantId, phoneDigits])`). Migração preenche `phoneDigits` do `phone`
  atual; se dois clientes da mesma loja tiverem o mesmo celular, só o mais recente recebe (o outro fica sem).
- **CashbackSettings** (1 por restaurante): `enabled`, `percent` (0,5 a 30), `validityMonths` (1 a 24), `minUseCents`.
- **CashbackCredit:** `restaurantId`, `customerId`, origem (`orderSessionId` ou `orderId`, únicos: uma venda credita
  uma vez), `amountCents`, `remainingCents`, `expiresAt`, `reversedAt`.
- **CashbackUse:** `restaurantId`, `customerId`, `orderSessionId`, `amountCents`, `createdAt`, `reversedAt`, e de quais
  créditos saiu (para devolver ao crédito certo).
- **OrderSession:** `customerId` (opcional) e `cashbackUsedCents` (padrão 0).

Saldo = soma de `remainingCents` dos créditos não estornados e não vencidos. Não precisa de rotina de vencimento:
o crédito vencido simplesmente não entra no saldo.

## 7. Fluxos

### 7.1 Fechar a conta (Vender > conta)
1. Campo **Celular do cliente (cashback)**, opcional, acima das formas de pagamento.
2. Celular conhecido: mostra o nome e o saldo. Desconhecido: pede o nome e cria o cliente ao fechar.
3. Saldo a partir do mínimo: botão **Usar cashback (R$ X)**. Abate até o que falta pagar. Pode tirar antes de pagar.
4. Ao fechar, credita `percent` × base (4.b), com validade `validityMonths`. O recibo e a tela mostram
   "Você ganhou R$ Y de cashback".
5. Vale também para conta dividida: o desconto entra uma vez na conta; o crédito sai no fechamento.

### 7.2 Venda de balcão
Mesmo campo. Feita sem internet: não consulta saldo nem usa cashback; o celular vai junto e o crédito entra quando a
venda chegar ao servidor.

### 7.3 Site de delivery
O pedido já pede celular: cria ou acha o cliente pelo celular (hoje é pelo e-mail). Credita quando o pedido é
concluído (status COMPLETED), uma vez por pedido. Pedido cancelado não credita.

### 7.4 Reabrir, cancelar, estornar
Reabrir ou cancelar a conta (fluxo de gerente que já existe) estorna o crédito que ela gerou (se o cliente já usou
parte, estorna o que sobrou e mostra quanto não deu para estornar) e devolve o cashback usado aos créditos de onde
saiu. Estorno de um pagamento parcial com a conta aberta não mexe no cashback.

## 8. Dinheiro, relatórios e nota

- **Caixa:** nada muda. A gaveta recebe o total já com o desconto.
- **DRE:** a receita bruta passa a somar o cashback usado, e "Deduções" ganha a linha **Cashback usado**. A receita
  líquida fica igual ao que entrou.
- **Vendas e Lucratividade:** a receita dos itens é o preço cobrado; o cashback aparece como desconto no total.
- **NFC-e:** o desconto é repartido entre os itens (`valor_desconto`, proporcional ao valor; o resto do arredondamento
  vai no último item), e os pagamentos somam o total já com o desconto.

## 9. Telas

- **Clientes e marketing > Cashback:** liga/desliga, percentual, validade, mínimo; números do mês (creditado, usado,
  saldo em aberto, a vencer em 30 dias) e as últimas movimentações.
- **Clientes (CRM):** busca por celular; total gasto, compras, ticket médio, última compra, segmento (4.c), saldo de
  cashback e o extrato do cliente. Cadastro sem e-mail.
- **Fidelidade** sai do menu (`/dashboard/loyalty` e os marcos redirecionam para Cashback).

## 10. CRM: de onde vêm os totais

Cada venda com cliente (conta fechada com celular, pedido de delivery concluído) soma em `totalSpent`, `totalOrders`,
`lastOrderAt` e recalcula `averageTicket`; reabrir/cancelar desconta. O segmento é calculado na leitura, pelas compras
dos últimos 90 dias (não grava um valor que fica velho).

## 11. Site, ajuda e IA

- Site e /pricing: "Campanhas e programa de fidelidade" vira "Cashback para seus clientes" (Business); Campanhas
  continua no Business.
- Artigo novo na Central de Ajuda ("Como funciona o cashback?") e a base da IA (vender, planos, novo cashback).
- O teste `help-seed-articles.test.ts` deixa de proibir a palavra Cashback.

## 12. Testes

- Unitários: cálculo do crédito (base, arredondamento, percentual), consumo dos créditos do mais antigo, vencimento,
  rateio do desconto na NFC-e, segmento.
- Integração: fechar com celular novo e conhecido; usar cashback (até o saldo, mínimo, desligado, plano Pro recusado);
  conta dividida; reabrir e cancelar (estorno e devolução); venda de balcão repetida (idempotência); delivery
  concluído e cancelado; DRE com a linha Cashback usado; NFC-e com desconto (provedor simulado); isolamento entre
  lojas (celular igual em duas lojas, saldo de uma não aparece na outra).
