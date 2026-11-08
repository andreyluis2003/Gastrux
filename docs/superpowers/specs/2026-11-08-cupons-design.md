# Cupons de desconto (2026-11-08)

Item 7 da comparação com o Anota AI. O dono disse "sim" para seguir; as decisões são minhas (mesmo acordo dos itens
anteriores), marcadas para ele conferir.

## Por quê

O site de delivery próprio só vence o iFood se o cliente tiver motivo para pedir direto. Cupom é o motivo mais
simples: "PRIMEIRA10", "FRETEGRATIS", o cupom da campanha do Instagram. Hoje o Gastrux não tem cupom; o único
desconto é o cashback na conta da mesa.

## Recon

- O pedido do site é calculado no servidor (`app/api/public/delivery/order/route.ts`): subtotal pelos preços do
  cardápio, taxa de entrega, total. O pagamento online cobra o `Order.total`.
- `ExternalOrder.discount` e `Order.discount` já existem e hoje vão sempre 0.

## Decisões

1. **Onde vale (v1): só no site de delivery.** O cliente digita o código no "Finalizar pedido"; o desconto aparece
   antes de confirmar e o servidor recalcula tudo na criação do pedido. WhatsApp, Vender, QR e API ficam para
   depois.
2. **Tipos:** % do subtotal, valor fixo (R$) do subtotal e **entrega grátis**. Nunca deixa o subtotal negativo.
3. **Regras opcionais por cupom:** pedido mínimo, validade (de/até), limite total de usos, limite por cliente
   (pelo celular; padrão 1) e "só no primeiro pedido" (o celular nunca pediu no site deste restaurante).
4. **Código:** letras e números, 3 a 20, sem acento, guardado em maiúsculas; único por restaurante. Digitado em
   qualquer caixa.
5. **Tela:** Clientes e marketing > **Cupons** (dono e gerente): criar, ver usos e total de desconto dado,
   pausar/reativar. Não apaga cupom usado (o histórico fica).
6. **Plano:** todos os planos (decisão minha, **confirmada pelo dono em 2026-11-08**): o cupom ajuda o site próprio a pegar tração
   e o cashback continua sendo do Business.
7. **Uso contado com segurança:** o uso é reservado numa transação (o limite total não estoura com dois pedidos
   ao mesmo tempo) e desfeito se o pedido não for criado. Pedido cancelado depois **não** devolve o uso (v1).
8. **Onde aparece o desconto:** no pedido (Pedidos de delivery e cozinha: "Cupom PRIMEIRA10: -R$ 5,00"), no
   `discount` do pedido e no total que o cliente paga.
9. Modelos novos `Coupon` e `CouponRedemption` (migração; tabelas novas, sem coluna em tabela antiga, então o
   Deploy não depende de ordem).

## Fora

Cupom no WhatsApp, no Vender e na API; cupom por produto/categoria; devolver o uso no cancelamento; gerar
cupons em lote; mandar cupom pela campanha.

## Junto

Ajuda, base da IA, manual, pendências, item no menu.
