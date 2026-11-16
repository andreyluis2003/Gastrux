# Cupom no WhatsApp, no balcão e na conta (2026-11-16)

Pedido do dono em 2026-11-16 ("Cupom no WhatsApp e no balcão (hoje só funciona no site de delivery)"). **Documento aprovado pelo dono em 2026-11-16.** O desenho
(as duas partes, conta/balcão primeiro e o robô depois) foi sugerido por mim e **aprovado pelo dono** ("sim"). O
que está marcado "decisão minha" é para ele conferir.

## Por quê

O cupom (spec `2026-11-08-cupons-design.md`) só vale no site de delivery. O dono divulga o código no Instagram,
no panfleto e no WhatsApp, e o cliente que pede pelo WhatsApp ou chega no balcão não consegue usar. Cupom de
campanha só funciona como motivo para pedir se **o cliente vê o desconto** antes de confirmar.

## Como é hoje (recon)

- **Site:** `lib/coupons/service.ts` confere (`checkCoupon`) e reserva o uso numa transação com trava
  (`reserveCoupon`); o uso vai para `CouponRedemption` (com `externalOrderId`) e o desconto para o pedido.
- **WhatsApp:** o robô (`lib/whatsapp/bot.ts`, `handleConfirmOrder`) não cria pedido de delivery: cria uma
  **comanda** (`OrderSession`, notas "Pedido via WhatsApp (celular)") e manda para a cozinha. Quem cobra é o
  caixa, na tela **Conta** do Vender. O resumo e a confirmação mostram o total do carrinho.
- **Conta do Vender** (`components/vender/conta-dialog.tsx`, `lib/comanda/bill-service.ts`): já tem desconto de
  **cashback** (`OrderSession.cashbackUsedCents`, rota `POST/DELETE /api/comanda/sessions/[id]/cashback`, só caixa
  para cima, exige o cliente identificado pelo celular). O cashback descontado aparece na conta, no pré-conta,
  na conta pública (QR), no cupom impresso, na NFC-e (rateado nos itens) e no DRE.
- **Venda balcão** (`components/comanda/counter-sale.tsx` → `POST /api/comanda/quick-sale`): **uma requisição
  só**, feita para funcionar sem internet (fila offline com a mesma Idempotency-Key). Pede celular (cashback
  só ganha, nunca usa, porque a venda pode ser offline), CPF na nota e pagamento; fecha a comanda na hora.
- **Cancelar ou reabrir conta:** `onBillReversed` (`lib/cashback/bill.ts`) já desfaz o cashback.

## Objetivo

O mesmo cupom de Clientes e marketing > Cupons vale em toda venda do restaurante: site (já), **robô do
WhatsApp**, **Conta do Vender** (mesa, comanda com nome, pedido do WhatsApp) e **venda balcão**. Mesmas regras
(tipo, pedido mínimo, validade, limite total, limite por celular, só no primeiro pedido), contado no mesmo
limite: um cupom com limite 100 soma os usos de todos os canais.

## Não é objetivo

- QR da mesa (o cliente pedindo pelo celular na mesa) e API de pedidos: continuam sem cupom. O pedido do QR
  vira comanda, então o caixa aplica o cupom na Conta.
- Cupom por produto ou categoria, cupons em lote, cupom na campanha (continuam fora).
- Devolver o uso de cupom de **pedido do site** cancelado (continua como hoje; só a comanda devolve, abaixo).

## Anti-objetivos

- A venda balcão **nunca** deixa de funcionar sem internet por causa do cupom.
- Cupom não dá desconto duas vezes na mesma conta, nem deixa a conta negativa.
- Não revelar se um código existe (mesma mensagem do site para cupom inexistente ou pausado).

## Abordagens consideradas

1. **Só um campo na Conta (o caixa aplica).** Simples; mas o cliente do WhatsApp não vê o desconto antes de
   confirmar, e a venda balcão (que não passa pela Conta) fica sem cupom.
2. **Cupom só no robô.** O balcão continua sem cupom e a comanda chega ao caixa sem a informação. Descartada.
3. **Escolhida pelo dono:** o cupom fica **na comanda** (como o cashback). Três entradas gravam nele: Conta do
   Vender, venda balcão e robô do WhatsApp. Conta/balcão primeiro (parte 1), robô depois (parte 2).

## Desenho

### Modelo

- `OrderSession.couponDiscountCents Int @default(0)` e `OrderSession.couponCode String?` (o código aplicado,
  para mostrar "Cupom PRIMEIRA10"). Decisão minha: guardado na comanda como o cashback, porque todos os totais
  (conta, pré-conta, impressão, NFC-e, DRE) já leem a comanda.
- `CouponRedemption.orderSessionId String?` (com índice): o uso pertence a um pedido do site **ou** a uma comanda.
- Migração: colunas novas em `order_sessions` e `coupon_redemptions`. **Atenção ao Deploy:** o Prisma lê todas as
  colunas da comanda, então entre o Deploy e o `migrate deploy` as telas de comanda quebram. Ordem: Deploy e
  migrate logo em seguida (homolog, depois app), como nas outras migrações. Se o builder conseguir uma ordem que
  não quebre, melhor.

### Regras na comanda

- **Base do desconto:** soma dos itens da comanda (sem taxa de serviço). Pedido mínimo olha essa soma.
- **Valor fixo na hora de aplicar** (decisão minha): o desconto é calculado quando o cupom é aplicado e não muda
  se entrarem itens depois. Se itens saírem e o desconto passar do que falta pagar, o total fica em 0, nunca
  negativo. Para recalcular, o caixa tira e põe o cupom.
- **Ordem com o cashback:** cupom primeiro sobre os itens; o cashback é limitado ao que sobrar (já é limitado ao
  que falta pagar). Taxa de serviço: decisão minha, continua calculada sobre os itens **sem** desconto (como hoje
  com o cashback); o builder confere como o cashback faz e segue igual.
- **Um cupom por comanda.** Trocar = tirar e aplicar outro.
- **Entrega grátis** numa comanda: a comanda não tem taxa de entrega, então recusa com "Este cupom é de entrega
  grátis e esta venda não tem taxa de entrega." (decisão minha).
- **Celular:** o limite por cliente e o "só no primeiro pedido" contam pelo celular. Na Conta, usa o cliente
  identificado na conta (o mesmo campo do cashback); sem cliente identificado e com cupom que tem regra por
  celular → "Identifique o cliente pelo celular antes". Cupom sem regra por celular (limite por cliente vazio e
  sem "primeiro pedido") aplica sem celular.
- **"Só no primeiro pedido"** passa a olhar, para aquele celular no restaurante: pedidos do site (como hoje)
  **e** comandas fechadas ligadas ao cliente (`OrderSession.customerId`, status CLOSED). Vale para todos os canais,
  inclusive o site (decisão minha: um cliente que já comprou no balcão não é mais "primeiro pedido").
- **Cancelar a comanda devolve o uso** (redemption apagada, `usedCount` volta), na mesma transação do
  cancelamento, junto com o `onBillReversed`. **Reabrir** uma conta fechada mantém o cupom (o caixa tira se quiser).
  Juntar comandas: o builder decide (provavelmente o cupom fica na comanda de destino, ou recusa juntar duas com
  cupom).
- **Quem pode:** caixa, gerente, dono (o mesmo `CASHIER_PLUS` do cashback). **Plano:** todos (como o cupom do site).
- **Tentativas:** limite de tentativas para não adivinhar códigos. O do site (`takeCouponTry`) conta por endereço
  (20/min) e por restaurante (300/min); no robô todas as mensagens chegam do mesmo endereço (Meta) e no salão a
  equipe divide um IP, então a chave aqui é o **celular da conversa** (robô) e o **usuário logado** (Conta e balcão),
  mais o total por restaurante (decisão minha, apontada na revisão).
- **Cashback ganho e compra no CRM** contam o que o cliente pagou: itens − cupom − cashback usado (hoje
  `billNumbers` só tira o cashback). Decisão minha: o cupom é dinheiro que o cliente não pagou.
- **Reabrir conta:** o cashback usado volta para o saldo (como hoje) e o cupom fica na conta (decisão minha: o
  cupom tem limite de usos; devolver e reaplicar poderia falhar). O caixa tira se quiser.

### Parte 1a: Conta do Vender

- Na tela Conta, ao lado do cashback: campo **"Cupom"** + **Aplicar**. Aplicado, a conta mostra
  "Cupom PRIMEIRA10 − R$ 5,00" com **Tirar**.
- Rota `POST /api/comanda/sessions/[id]/coupon` `{ code }` (reserva o uso na transação, com a trava da comanda e a
  trava do cupom) e `DELETE` (devolve o uso). Recusa se a conta estiver fechada/cancelada ou já tiver cupom.
- O desconto aparece em: Conta, pré-conta impresso, conta pública do QR, cupom impresso, total da rota da sessão,
  NFC-e (rateado nos itens junto com o cashback) e DRE (na mesma linha de descontos do cashback, ou numa linha
  "Cupons"; o builder segue o que o DRE já faz com o desconto dos pedidos do site).

### Parte 1b: Venda balcão

- Campo **"Cupom"** na venda balcão, ao lado do celular: **Aplicar** confere no servidor (prévia, nada gravado) e
  mostra o desconto; o total a pagar e o troco já saem com o desconto.
- **Sem internet o campo fica desligado** ("Cupom precisa de internet"). A venda continua normal sem cupom.
- A venda vai com `couponCode`; o servidor reserva o uso na mesma transação da venda.
- **Se a conferência final recusar** (ex.: o limite acabou entre a prévia e o envio, ou a venda ficou na fila
  offline e o cupom venceu): decisão minha, **a venda entra sempre com o desconto** que o servidor calcula pelo
  código (o cliente já pagou assim) e o uso é registrado mesmo passando da regra, marcado como "fora da regra"
  (o caixa vê um aviso; a tela de Cupons mostra). Motivo (revisão): o servidor não distingue uma venda online de
  uma reenviada pela fila (mesmo corpo e mesma Idempotency-Key), e recusar na fila faz a venda falhar e poder ser
  descartada. O desconto **nunca** vem do aparelho: o servidor sempre calcula pelo cupom. Código que não existe
  mais: a venda entra sem desconto e com aviso (o builder trata o pagamento a mais como troco/diferença, como já
  faz com pagamentos que passam do total).

### Parte 2: Robô do WhatsApp

- Depois de coletar os dados e antes do resumo, o robô pergunta: "Tem cupom de desconto? Digite o código ou
  *não*." (só se o restaurante tiver ao menos um cupom ativo; senão pula a pergunta).
- Código válido → resumo com "Cupom PRIMEIRA10: −R$ 5,00" e o total com desconto. Inválido → a mensagem da regra
  e a mesma pergunta de novo (digitar *não* segue sem cupom). Prévia no resumo, sem gravar.
- O celular é o da conversa (garantido pelo WhatsApp).
- **Na confirmação** o uso é reservado e gravado na comanda criada (`couponDiscountCents`, `couponCode`,
  redemption com `orderSessionId`), na mesma transação da criação da comanda. Se a conferência final recusar (o
  limite acabou entre o resumo e o "confirmar"), o robô avisa e mostra o resumo sem o cupom para confirmar de novo.
- A confirmação ("Pedido confirmado! Total ...") mostra o total com desconto.
- **Cliente ligado à comanda:** para as regras por celular a comanda do WhatsApp passa a ter `customerId` (cliente
  do CRM pelo celular da conversa) **sempre**, com ou sem cupom (minha recomendação; o dono aprovou o documento
  com ela em 2026-11-16). Consequência: todo pedido do WhatsApp entra no CRM e ganha cashback no fechamento da
  conta (`onBillClosed`), e conta como pedido anterior no "só no primeiro pedido". Nome do cliente: o da conversa.
- O caixa, ao abrir a Conta dessa comanda, já vê o cupom aplicado e só cobra.

## Junto

Ajuda (artigo do cupom: tira "só no site", explica Conta, balcão e WhatsApp; hash antigo), base da IA
(`lib/ai/knowledge/delivery.ts` e onde mais o cupom é citado), tela de Cupons (texto "vale só no site" se houver;
usos por canal se for barato), manual (Claude Doc), `docs/pendencias.md` (tira o item resolvido, põe o que
ficar).

## Deixado para o builder

- Nome das rotas e dos campos, como o robô guarda o cupom na conversa (contexto), testes.
- Como o DRE mostra o desconto de cupom.
- O que fazer ao juntar comandas com cupom.
- Ordem de Deploy que evite a quebra entre Deploy e migrate, se houver uma simples.
