# Pagamento na mesa pelo celular, com divisão da conta — Design

**Data:** 2026-10-10
**Status:** design aprovado em chat (5 perguntas + 3 partes), aguardando revisão deste documento
**Origem:** pesquisa do concorrente 3S Checkout (E-Deploy) de 2026-10-10, que testa um app com reserva, pedido pelo QR e conta dividida paga por pessoa. Backlog item 7.

## 1. Problema

O cliente já lê o QR code da mesa (`/menu/[qrToken]`), faz o pedido e paga a conta inteira por PIX pelo Mercado Pago do restaurante (`POST /api/pagamentos/mp/pix` com `qrToken`, valor calculado no servidor por `lib/mercadopago-connect/pix-target.ts`). Mas:

- **Não dá para dividir.** O PIX é sempre o total da conta.
- **O PIX não entra na conta nem no caixa.** A conta (`lib/comanda/bill-service.ts`) só soma os pagamentos do caixa (`CashSessionEntry` ligados à comanda). O PIX da mesa fica numa linha de `Payment` com `metadata.sessionId`; `lib/mercadopago-connect/tab-reconcile.ts` só avisa o operador quando o valor pago não bate. Alguém da equipe ainda precisa fechar a conta à mão, e o caixa não sabe que aquilo foi pago.
- **Só PIX.** Não há cartão nem um jeito de o cliente chamar o garçom para pagar.

## 2. Objetivo e critério de sucesso

Cada pessoa da mesa paga a sua parte pelo celular (PIX ou cartão), ou chama o garçom; a conta soma tudo e **fecha sozinha** quando chega ao total, libera a mesa e emite uma NFC-e.

**Sucesso:** uma mesa de 4 paga em 4 partes (por exemplo 2 PIX, 1 cartão, 1 com o garçom) sem ninguém da equipe fechar a conta, e o resumo do turno mostra os valores online separados da gaveta.

**Para quem:** o cliente na mesa (sem login), o garçom e o operador de caixa (`CASHIER`; o Gastrux não tem papel próprio de garçom), o gerente e o dono (`MANAGER`, `OWNER`).

## 3. Decisões do dono (2026-10-10)

1. **Divisão:** partes iguais e valor livre agora; cada um pagar os próprios itens fica para uma etapa futura.
2. **Meios:** PIX, cartão de crédito (Checkout Pro do Mercado Pago, como no delivery) e "pagar com o garçom".
3. **Taxa de serviço:** vem incluída e aparece separada, com o aviso de que é opcional; só a equipe retira (fluxo que já existe, `setServiceWaived`).
4. **Fechamento:** a conta fecha sozinha quando os pagamentos chegam ao total; uma NFC-e com o total; CPF opcional (vale o do último pagamento que informou).
5. **Plano:** só Business no piloto (mesma regra do cardápio por QR, `qrMenu` em `lib/tier-guard.ts`).
6. **Caminho técnico:** o pagamento online vira um pagamento da conta, igual ao do caixa (caminho 1 de 3).

## 4. Fora do escopo

Cada um pagar os próprios itens; gorjeta acima dos 10%; Apple Pay e Google Pay; débito e vale-refeição online; liberar para Pro ou Starter; reserva e fila de espera (outro item do backlog).

## 5. Design

### 5.1 Tela do cliente (`/menu/[qrToken]`)

O botão **"Ver conta e pagar"** aparece quando o restaurante está no plano Business, tem o Mercado Pago conectado (`MercadoPagoConnection` ativa) e a mesa tem uma comanda aberta. Fora disso: "Peça a conta ao garçom".

1. **A conta:** itens com quantidade e valor; subtotal; taxa de serviço em linha própria com o aviso *"A taxa de serviço é opcional. Para retirar, fale com o garçom."*; **Total**, **Já pago** e **Falta pagar**.
2. **Quanto vai pagar:**
   - **Tudo:** o que falta.
   - **Partes iguais:** a pessoa escolhe de 2 a 20. Parte = `ceil(totalCents / N)`, limitada ao que falta (quem paga por último paga só o que falta, absorvendo os centavos).
   - **Outro valor:** de R$ 1,00 até o que falta.
3. **Como vai pagar:** PIX (QR e "copia e cola", com confirmação por consulta), cartão de crédito (vai ao Checkout Pro e volta para a conta da mesa), ou **Pagar com o garçom**. Campo **CPF na nota**, opcional, validado.
4. **Depois de pagar:** *"Pagamento confirmado: R$ X. Falta R$ Y."* A tela consulta a conta a cada 10 s. Quando não falta nada: *"Conta paga! Obrigado."* e o link da NFC-e se houver.

A tela é a mesma do cardápio por QR; o carrinho e o pedido continuam como estão.

### 5.2 Equipe

- **Mapa de mesas (Vender):** a mesa com pagamento parcial pelo celular mostra *"R$ pago de R$ total"*; a mesa que pediu "pagar com o garçom" fica em destaque; a mesa paga pelo celular volta a ficar livre.
- **Conta da mesa:** os pagamentos do celular aparecem na lista como **"PIX online"** e **"Cartão online"**, com hora, junto dos do caixa. O garçom recebe o resto pelo caixa como hoje. Retirar a taxa de serviço continua com a equipe; os celulares passam a mostrar o novo valor que falta.
- **Avisos no sino** (restaurante inteiro, `userId` nulo, `lib/notification-utils.ts`): "Mesa 5 quer pagar com o garçom"; "Mesa 5 paga pelo celular: R$ 120,00"; para o gerente: "Mesa 5 pagou R$ 12,00 a mais pelo celular" e "Pagamento online recebido sem caixa aberto (Mesa 5, R$ 50,00)".
- **Pagou a mais:** o gerente devolve pelo Mercado Pago com o botão **Estornar** da tela de pagamentos (`lib/payments/refund-eligibility.ts`, `refundConnectPayment`). Nenhum dinheiro sai da gaveta.
- **Caixa:** o resumo do turno ganha as linhas **"PIX online"** e **"Cartão online"**, fora do "esperado na gaveta"; o fechamento às cegas continua contando só a gaveta.
- **Reabrir conta fechada:** fluxo do gerente igual; os pagamentos online continuam valendo e só o restante volta a ficar aberto.

### 5.3 Dados

Os pagamentos online continuam em `Payment` (gateway `MERCADO_PAGO_CONNECT`), que já guarda valor, status, `gatewayPaymentId` e estorno. Migração aditiva:

- `Payment.orderSessionId String?` (FK para `OrderSession`, índice): a conta da mesa que o pagamento quita. Substitui o `metadata.sessionId` (lido como alternativa só para os pagamentos antigos).
- `Payment.cashSessionId String?` (FK para `CashSession`, índice): o turno aberto quando o pagamento foi confirmado; nulo quando não havia turno.
- `Payment.customerCpf String?`: CPF informado para a nota.
- `Payment.tableShareMode String?`: `ALL`, `EQUAL:<N>` ou `AMOUNT`, para o histórico e o suporte.
- `Payment.appliedToBillAt DateTime?`: quando o pagamento foi somado à conta; garante que ele é aplicado uma vez só.
- `OrderSession.payAtWaiterRequestedAt DateTime?`: o pedido de "pagar com o garçom", limpo quando entra um pagamento ou a conta fecha.

Nada muda em `CashSessionEntry`: a gaveta e o fechamento às cegas continuam sendo só os pagamentos do caixa.

### 5.4 Regras no servidor

- **A conta soma os dois lados.** `loadBill` passa a somar os `CashSessionEntry` da comanda (como hoje) **e** os `Payment` com `orderSessionId` da comanda, status aprovado, menos o valor estornado. `BillPayment` ganha os métodos `PIX_ONLINE` e `CARD_ONLINE` para a lista.
- **Criar a cobrança:** `POST /api/public/table/[qrToken]/pay` com `{ mode: 'ALL' | 'EQUAL' | 'AMOUNT', people?, amountCents?, method: 'PIX' | 'CARD', cpf? }`. O servidor resolve mesa, restaurante e comanda pelo `qrToken`, confere plano Business e Mercado Pago conectado, carrega a conta, calcula o valor pela regra de 5.1, recusa o que passar do que falta ou ficar abaixo de R$ 1,00, cria o `Payment` pendente com `orderSessionId` e cria no Mercado Pago **do restaurante** o PIX (`createConnectPix`) ou a preferência de cartão (o mesmo caminho do delivery), com `notification_url` do restaurante (`notificationUrlFor`). O navegador nunca decide valor, restaurante nem comanda.
- **Aplicar o pagamento confirmado:** uma função única `applyTablePayment(restaurantId, paymentId)` chamada quando o `Payment` vira aprovado, pelos três caminhos que já existem (webhook, consulta da tela, conferência a cada 5 min em `payment-sync`/`status-reconcile`). Dentro de uma transação com a trava da comanda (`lockComanda`): se `appliedToBillAt` já existe, não faz nada; senão grava `appliedToBillAt`, `cashSessionId` (turno aberto do restaurante, ou nulo), limpa `payAtWaiterRequestedAt`, recarrega a conta e, se `pago >= total`, fecha pelo mesmo `updateMany` de `recordBillPayment` (status, `closedAt`, `serviceChargeCents`, mesa livre). Depois da transação: NFC-e por `emitClosedBill` com o CPF do último pagamento que informou, como ator de sistema; avisos do sino (paga, pagou a mais, sem caixa). Nunca recusa um pagamento já aprovado.
- **Conta já fechada ou cancelada quando o pagamento chega:** o pagamento é marcado como aplicado, não reabre a conta, e o gerente recebe o aviso de "pagou a mais" com o valor inteiro.
- **`tab-reconcile.ts`:** deixa de ser chamado para os pagamentos com `orderSessionId`; os avisos de diferença passam a vir de `applyTablePayment`.
- **Pagar com o garçom:** `POST /api/public/table/[qrToken]/call-waiter` grava `payAtWaiterRequestedAt` e cria o aviso do sino; no máximo um por minuto por mesa (o servidor ignora repetições dentro do minuto).
- **Leitura pública da conta:** `GET /api/public/table/[qrToken]/bill` devolve só a conta aberta daquela mesa (itens, subtotal, taxa, total, pago, falta, se pediu garçom, se está fechada e o link da NFC-e). Nada de outras mesas, de outros clientes nem de dados da equipe.

### 5.5 Erros

| Situação | O que acontece |
|---|---|
| Mesa sem conta aberta | A tela mostra "Peça a conta ao garçom"; o pagamento é recusado (409). |
| Restaurante fora do Business ou sem Mercado Pago conectado | O botão não aparece; o servidor recusa (403). |
| Valor maior que o que falta, ou menor que R$ 1,00 | Recusado (422) com o valor que falta. |
| Item adicionado depois de alguém pagar | O que falta aumenta; as partes iguais seguem `ceil(total / N)` sobre o novo total. |
| Taxa retirada pelo garçom no meio | O que falta diminui; um pagamento que passe do novo total gera o aviso de "pagou a mais". |
| Dois pagamentos confirmados ao mesmo tempo | A trava da comanda aplica um depois do outro; o que passar do total vira aviso de "pagou a mais". |
| Mesma confirmação chegando duas vezes | `appliedToBillAt` impede somar duas vezes. |
| Sem caixa aberto | O pagamento entra na conta com `cashSessionId` nulo e o gerente é avisado. |
| PIX expirado ou cartão recusado | Nada é somado; a tela permite tentar de novo. |
| Falha da NFC-e | A conta fecha mesmo assim; o alerta fiscal já existente aparece no sino. |

## 6. Testes

- **Unitários:** cálculo das partes (`ceil`, limite ao que falta, centavos para o último), validação de valor mínimo e máximo, CPF.
- **Integração (banco de teste):** conta somando caixa e online; confirmação repetida aplicada uma vez; dois pagamentos simultâneos; fechamento automático com taxa e mesa livre; NFC-e chamada uma vez com o CPF certo; pagou a mais; sem caixa aberto; pagamento chegando com a conta fechada; taxa retirada no meio; recusa fora do Business e sem Mercado Pago; leitura pública que não vaza outra mesa; limite do "chamar o garçom".
- **Homologação no navegador:** a tela do cliente no celular e a conta e o mapa na tela do garçom.
- **Produção, restaurante de teste:** conta de R$ 3,00 paga em 3 partes de R$ 1,00 (PIX, cartão, garçom); conferir fechamento, NFC-e, avisos e resumo do turno; estornar os dois pagamentos online. O PIX não é testável com contas de teste do Mercado Pago (2026-10-04).

## 7. Etapas de entrega

Cada etapa publicada na `main` e testada antes da próxima:

1. **A conta recebe os pagamentos online e fecha sozinha:** migração, `loadBill` somando `Payment`, `applyTablePayment` ligado aos três caminhos de confirmação, avisos, resumo do turno.
2. **Tela do cliente com PIX:** leitura pública da conta, "tudo", partes iguais e valor livre, CPF.
3. **Cartão e "pagar com o garçom".**
4. **Mapa de mesas e conta da mesa na tela da equipe.**
