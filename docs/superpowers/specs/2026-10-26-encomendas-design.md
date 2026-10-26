# Encomendas (padaria, fase 3)

Data: 2026-10-26. O dono disse "pode decidir tudo, começa direto": as decisões abaixo são minhas (Claude).

## Por quê

Padaria, doceria e confeitaria vivem de encomenda: bolo de aniversário para sábado, cento de salgados para a
festa, torta para retirar às 15h. Hoje o restaurante anota no caderno ou abre uma comanda que fica no salão
por dias, misturada com as mesas, e o sinal recebido some do controle.

## O que é uma encomenda no sistema

Uma comanda com o status novo **ENCOMENDA** e a data e hora da retirada (`OrderSession.pickupAt`). Assim ela
reaproveita tudo o que a comanda já faz: itens por unidade e por peso, adicionais, observação, pagamentos
parciais no caixa, NFC-e, cashback e baixa de estoque no fechamento.

- **Fora do salão.** As telas e alertas de comandas abertas olham só OPEN, SENT_TO_KITCHEN e READY: a
  encomenda não aparece no salão, no "Comanda por nome", nos alertas de comanda esquecida nem no fechamento
  do caixa como comanda aberta.
- **Sinal.** Recebido em **Conta**, como qualquer pagamento: entra no turno de caixa do dia em que foi
  recebido. Uma conta de encomenda **nunca fecha sozinha** ao ser paga, nem paga por inteiro adiantado.
- **Cozinha.** "Enviar para a cozinha" funciona (a produção do dia vê no KDS), mas a encomenda continua
  encomenda.
- **Retirada.** "Cliente retirou": a encomenda vira comanda aberta (OPEN) e as linhas passam a contar a partir
  de agora (a venda é do dia da retirada, nos relatórios de vendas e na contagem do dia). Já paga: fecha na
  hora (estoque, cashback, NFC-e). Falta pagar: abre a comanda para receber o restante em Conta.
- **Cancelar.** Pelo menu "⋯" da comanda, como hoje: motivo, e o sinal pago no caixa volta no caixa aberto
  (regra que já existe para comanda cancelada com pagamento).
- **Relatórios.** Itens de encomenda não retirada não contam como vendidos.

## A tela

**Vender > Encomendas** (`/encomendas`, dono, gerente e caixa):

- **Nova encomenda**: nome do cliente (obrigatório), celular (opcional; entra no CRM/cashback), data e hora
  da retirada (obrigatório), observação. Cria e abre a encomenda na tela da comanda para lançar os itens.
- A agenda: **Atrasadas** (retirada passou), **Hoje**, **Amanhã**, **Próximos dias**. Cada encomenda mostra hora,
  cliente, celular, os itens, o total, o que já foi pago e o que falta, com **Abrir** e **Cliente retirou**.
- Na tela da comanda, uma faixa diz "Encomenda para dd/mm às hh:mm" e explica que a conta só fecha na
  retirada, com o botão **Cliente retirou**.

## Fora (docs/pendencias.md)

- Pedido de encomenda pelo cliente (site, WhatsApp) e aviso por WhatsApp/e-mail quando ficar pronta.
- Encomenda no Planejamento de produção (somar as encomendas do dia no plano).
- Impressão da ficha da encomenda para a produção.
