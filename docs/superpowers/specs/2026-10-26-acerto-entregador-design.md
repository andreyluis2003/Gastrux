# Acerto com o entregador (delivery pago na entrega)

Data: 2026-10-26. O dono pediu "faz o acerto com o entregador" (item da revisão de 19/10, adiado no spec do caixa
de 2026-10-04, 6.5). As decisões abaixo são minhas (Claude).

## O problema

Um pedido de delivery pago na entrega (dinheiro, crédito, débito ou vale na maquininha do entregador) entra na
receita (DRE e vendas, pelo pedido), mas o dinheiro que o entregador traz não entra em nenhum turno de caixa. No
fechamento, a gaveta tem mais dinheiro do que o esperado e a maquininha mais cartão, e ninguém sabe quanto cada
entregador deve devolver.

## Decisões

1. **Quem levou.** Ao marcar "Saiu para entrega" em Pedidos de delivery, o caixa pode escrever o nome do entregador
   (com os nomes já usados como sugestão). Sem cadastro de entregadores: um nome basta (`ExternalOrder.driverName`).
2. **Acerto no Caixa.** Na tela do Caixa, com o turno aberto, o botão **Acerto do entregador** mostra, por
   entregador, os pedidos pagos na entrega que saíram ou foram entregues e ainda não foram acertados (pedidos sem
   nome ficam em "Sem nome"). Para cada um: número, cliente, forma e valor.
3. **O que o acerto grava** (tabela `DeliverySettlement`, ligada ao turno), numa transação, com o turno travado:
   - um RECEIPT por forma (dinheiro, crédito, débito; vale entra como "Outro") no turno aberto, com
     `orderSessionId` nulo: entra no esperado da gaveta e da maquininha, mas não nas vendas do turno nem na DRE,
     que já contam o pedido (sem receita em dobro);
   - **dinheiro recebido**: o caixa digita quanto o entregador entregou. Diferença do esperado vira um ADJUSTMENT
     (saída se faltou, entrada se sobrou) com o motivo, obrigatório quando há diferença;
   - **pagamento do entregador** (opcional): uma Despesa "entregador" em dinheiro. O caixa paga até a soma das
     taxas de entrega desses pedidos; acima disso, só gerente (a Despesa comum já é só de gerente);
   - os pedidos ficam com `settlementId`: não aparecem de novo. Dois acertos ao mesmo tempo do mesmo pedido: o
     segundo é recusado (409).
4. **O troco que o entregador leva** sai e volta para a gaveta: não precisa lançar. O acerto confere só o valor
   dos pedidos.
5. **Pedidos pagos online** (PIX, cartão no site) e pedidos cancelados ou recusados não entram.
6. **Turno fechado ou sem turno:** o botão só aparece com o turno aberto do aparelho; o servidor recusa num turno
   fechado (409).

## Fora (docs/pendencias.md)

- Cadastro de entregadores, taxa fixa por entrega e relatório por entregador no mês.
- Acerto de pedido lançado na comanda (Venda balcão marcada como delivery): já é pago no caixa.
