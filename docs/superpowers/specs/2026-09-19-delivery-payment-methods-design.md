# Formas de pagamento no delivery — Design

**Data:** 2026-09-19
**Status:** lista de formas de pagamento confirmada pelo dono do produto em 2026-09-19; este documento traduz a decisão em desenho técnico
**Depende de:** `docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md` (conexão do restaurante com o Mercado Pago, PIX, webhook e checkout de cartão)

## 1. Problema

O delivery (`app/delivery/[restaurantId]/page.tsx`) só oferece PIX: depois de criar o pedido, o único passo possível é o de pagamento PIX. Decisão de produto: o delivery precisa oferecer **todas as formas de pagamento comuns no mercado**, incluindo PIX, cartão de crédito e cartão de débito. Isso substitui a proposta anterior (plano do Mercado Pago, desvio 8) de "PIX ou, sem conexão, pagamento na entrega".

## 2. Decisão de produto (confirmada)

**Pagar online agora**, na conta Mercado Pago do próprio restaurante (exige a conexão do plano do Mercado Pago):
- **PIX**, com QR Code na própria página.
- **Cartão de crédito ou débito e saldo Mercado Pago**, pelo Checkout Pro (o cliente é levado ao Mercado Pago e volta). Boleto fica de fora, porque leva dias para compensar e não serve para entrega.

**Pagar na entrega**, com o restaurante marcando quais aceita:
- **Dinheiro**, com "troco para quanto?" opcional.
- **Cartão de crédito** e **cartão de débito** na maquininha.
- **Vale-refeição/alimentação** na maquininha, com a bandeira escolhida (VR, Alelo, Sodexo, Ticket). Fica só na entrega porque, até onde sei, o Mercado Pago não processa essas bandeiras (a confirmar).

Restaurante sem Mercado Pago conectado continua recebendo pedidos, só com as formas "na entrega".

## 3. Padrões e defaults

- A escolha é validada **no servidor** contra o que o restaurante aceita e contra a conexão do Mercado Pago; a tela só mostra o que está disponível.
- Restaurante que nunca configurou nada usa o padrão: dinheiro, crédito e débito na entrega **ligados**; vale-refeição **desligado**. Assim ninguém fica sem forma de pagamento depois do deploy.
- O troco deve ser maior ou igual ao total do pedido (validado no servidor; total calculado no servidor).
- A cozinha e o entregador enxergam a forma escolhida sem mexer no KDS: o cartão do KDS já mostra `Order.specialInstructions`, e a rota do delivery já empacota endereço e cliente nesse campo; ganha uma linha "Pagamento: ..." (com troco a levar, ou "levar maquininha").

## 4. Dados

- Enum novo `DeliveryPaymentMethod`: `ONLINE_PIX`, `ONLINE_CARD`, `CASH`, `CREDIT_ON_DELIVERY`, `DEBIT_ON_DELIVERY`, `VOUCHER_ON_DELIVERY`.
- `Order` ganha `paymentMethod DeliveryPaymentMethod?`, `cashChangeFor Decimal?` e `voucherBrand String?`, para relatórios e conferência.
- Tabela nova `DeliveryPaymentSettings`, uma linha por restaurante (sem linha = padrão): `acceptCash`, `acceptCreditOnDelivery`, `acceptDebitOnDelivery`, `acceptVoucherOnDelivery` e `voucherBrands`.
- Pagamento online usa o `Payment` do plano do Mercado Pago (`MERCADO_PAGO_CONNECT`). Não há tabela nova para ele.

## 5. Fluxo

1. A tela busca as opções em `GET /api/public/delivery/menu/[restaurantId]` (`restaurant.paymentOptions`, calculado no servidor).
2. O cliente escolhe a forma no passo de finalizar pedido (e informa troco ou bandeira quando cabe).
3. `POST /api/public/delivery/order` valida a escolha, grava os campos no pedido e acrescenta a linha de pagamento nas observações.
4. Depois de criar o pedido:
   - **PIX online:** passo de pagamento existente, agora pelo `orderId` (plano do Mercado Pago).
   - **Cartão online:** o passo de pagamento oferece o botão "Pagar com cartão"; `POST /api/pagamentos/mp/delivery-checkout` cria o pagamento e a preferência do Checkout Pro com o token do restaurante (excluindo boleto e caixa eletrônico) e devolve o link; o cliente paga no Mercado Pago e volta para `/delivery/<restaurantId>?payment=<id>&n=<numero>`, onde a tela consulta o status até aprovar.
   - **Na entrega:** confirmação direta, com a forma escolhida e o troco.
5. O webhook do plano do Mercado Pago marca o `Payment` e o pedido como pagos.

## 6. Configuração pelo restaurante

Cartão "Formas de pagamento aceitas" na página `app/admin/delivery-site/page.tsx`, com as quatro opções "na entrega", a escolha das bandeiras de vale e o estado do pagamento online (com atalho para conectar o Mercado Pago). API: `GET|PUT /api/admin/delivery/payment-settings`.

## 7. Fora de escopo

- Outras carteiras e maquininhas integradas (Stone, Cielo, etc.), Apple Pay/Google Pay como método próprio, boleto, PIX "na entrega" com chave do restaurante.
- Taxa de entrega configurável (hoje fixa na tela; fora deste projeto).
- Reembolso de pedido de delivery com cartão online (segue o reembolso do plano do Mercado Pago).
- Mostrar a forma de pagamento em telas do KDS além da observação do pedido.

## 8. Riscos e premissas a confirmar

- **Checkout Pro:** os nomes dos tipos de pagamento a excluir (`ticket`, `atm`) e a aceitação de saldo Mercado Pago dependem da documentação atual do Mercado Pago (premissa de conhecimento geral, não verificada).
- **Vale-refeição:** confirmar que o Mercado Pago realmente não processa essas bandeiras; se processar, avaliar oferecê-las online.
- **Páginas em cache:** a resposta pública do cardápio é cacheada por 60 segundos; a validação no servidor impede que uma opção desatualizada seja aceita.
- **Compatibilidade:** a tela antiga (em cache no navegador) não envia `paymentMethod`; o servidor recusa com erro claro e a recarga resolve.

## 9. Testes

- **Unitários, sem banco:** opções a partir das configurações, validação da escolha (troco, bandeira, disponibilidade), texto da observação, leitura das configurações enviadas pelo restaurante, exclusão de tipos de pagamento na preferência.
- **Integração, escritos e não executados até haver banco de teste:** serviço de configurações, rota de configurações, pedido de delivery com escolha (válida e inválida, isolamento entre restaurantes), rota de checkout de cartão, resposta pública do cardápio.
- **Manual:** cada forma de pagamento de ponta a ponta no sandbox do Mercado Pago e com pedido "na entrega".
