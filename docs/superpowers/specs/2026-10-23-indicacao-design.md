# Programa de indicação (design, 2026-10-23)

Pedido do dono: "quero um programa de indicação de verdade", com o link de indicação funcionando no cadastro, o
desconto aplicado na fatura (Stripe ou Mercado Pago) e uma regra clara. O dono pediu para pular as perguntas e
receber a proposta montada. Em 2026-10-23 ele confirmou: 15 dias a mais de teste para o indicado, 1 mês grátis com
limite de 12 por ano para quem indica, e no Mercado Pago testar a pausa de um ciclo no sandbox antes de decidir.

A versão anterior (apagada em 2026-10-23, commit 60f1891) prometia "R$ 50 em créditos" que a cobrança nunca usava,
e o link `/?ref=` não era lido no cadastro. Os campos `users.referralCode`, `referredByUserId`, `referralBonus*`,
`referralTier` e a tabela `referral_history` ficaram no banco, sem uso: este design não depende deles e pode
substituí-los numa migração própria.

## A regra (confirmada pelo dono)

- **Quem indica** é o dono de um restaurante no Gastrux, em qualquer plano ou no teste.
- **Quem é indicado** é um restaurante novo: e-mail e CNPJ (quando houver) que nunca tiveram conta no Gastrux.
- **O indicado ganha** 15 dias a mais de teste grátis (45 em vez de 30), aplicados no cadastro. Isso dá ao link
  um motivo para ser usado e custa pouco.
- **Quem indica ganha 1 mês grátis** do próprio plano quando o indicado **pagar a primeira mensalidade** (depois do
  teste, cobrança aprovada no Stripe ou no Mercado Pago). Indicado que só testa não gera nada.
- **Se o indicado for reembolsado ou cancelar em até 7 dias** depois da primeira cobrança, o mês ainda não usado é
  cancelado.
- **Limite de 12 meses grátis ganhos por ano** por restaurante que indica.
- **Mês ganho sem assinatura paga** (quem indica ainda está no teste, ou sem plano) fica guardado e é usado na
  primeira cobrança.
- Indicar a si mesmo não conta: mesmo e-mail, mesmo CNPJ ou mesmo dono (outra loja do mesmo usuário em Várias lojas).

## Como o mês grátis chega na fatura

- **Stripe:** um crédito no saldo do cliente (`customers.createBalanceTransaction`, valor negativo) igual a uma
  mensalidade do plano atual. O Stripe abate sozinho da próxima fatura, mensal ou anual. No plano anual, o crédito
  vale uma mensalidade (1/12 do valor mensal do plano, não do anual) e abate da renovação.
- **Mercado Pago (assinatura por preapproval):** o MP não tem crédito nem cupom em assinatura. **Decisão do dono:
  testar primeiro no sandbox a pausa de um ciclo** (`updatePreApproval` já tem `paused`): pausar depois da cobrança
  aprovada e retomar antes da seguinte, sem cobrar o mês grátis. O teste precisa mostrar que o MP não cobra durante a
  pausa, que a retomada volta a cobrar na data certa e o que acontece com a data quando a pausa atravessa o dia da
  cobrança. Só se a pausa falhar no sandbox, o caminho é o estorno automático da mensalidade (`refundPayment`, que o
  Gastrux já usa), e o dono decide de novo antes.
- Cada mês grátis vira uma linha com o estado: **aguardando** (indicado em teste), **ganho** (indicado pagou),
  **usado** (abatido ou estornado, com o id da cobrança), **cancelado** (reembolso ou cancelamento em 7 dias, ou
  limite do ano). Nada é aplicado duas vezes: a aplicação é idempotente por linha.

## O que cada pessoa vê

- **Dono (Minha assinatura > Indique e ganhe):** o link (`gastrux.com/?ref=CÓDIGO`) e o código, botões de copiar e
  de mandar pelo WhatsApp, a regra em uma frase ("Ganhe 1 mês grátis para cada restaurante que assinar pelo seu
  link"), e a lista: indicados em teste, que já pagaram, meses ganhos, usados e guardados.
- **Indicado:** quem chega pelo link vê no cadastro "Indicado por <nome do restaurante>: 45 dias grátis". O link
  guarda a indicação por 60 dias (cookie), mesmo que a pessoa volte depois. Também há o campo "Código de indicação
  (opcional)" no cadastro.
- **E-mails (Resend):** para quem indica, quando o indicado se cadastra e quando paga ("você ganhou 1 mês grátis");
  sem dados do indicado além do nome do restaurante.
- **Plataforma Gastrux > Indicações:** todas as indicações com estado, meses dados no mês e o custo estimado,
  com botão para cancelar uma indicação suspeita (com motivo, auditado).
- **Site:** uma linha na página de preços ("Indique o Gastrux e ganhe 1 mês grátis"), e o artigo de ajuda e a base
  da IA atualizados.

## Metas, não metas e o que faria isso dar errado

- **Meta:** um dono satisfeito traz outro restaurante, e a recompensa chega sozinha na fatura dele, sem ninguém da
  Gastrux fazer nada.
- **Não metas:** pagar em dinheiro, PIX ou comissão; níveis (bronze, prata); indicação de clientes do restaurante
  (isso é o cashback); afiliados ou influenciadores.
- **Daria errado se:** a tela prometer algo que a fatura não faz (o erro da versão antiga); o mesmo dono ganhar
  meses com lojas dele mesmo; o mês grátis ser aplicado duas vezes num webhook repetido; o indicado perder os 15 dias
  por ter aberto o link num dia e se cadastrado em outro.

## Restrições

- Os gateways são os de hoje: Stripe (checkout de assinatura, webhook em `app/api/billing/webhook`) e Mercado Pago
  (preapproval, `app/api/billing/mp/checkout-session` e o webhook do MP).
- O teste grátis já desconta os dias restantes do teste do app no gateway (`remainingTrialDays`): os 45 dias do
  indicado entram como o `trialEndsAt` do restaurante, e o gateway usa o que sobrar, como hoje.
- **Fiscal:** a NFS-e da assinatura sai pelo valor cobrado. Um mês grátis no Stripe reduz o valor da fatura
  (desconto); no MP, a cobrança e o estorno são de mesmo valor. Perguntar ao contador como emitir nos dois casos
  (desconto incondicional na nota, ou nota e cancelamento) antes do primeiro mês grátis real.
- Uma conta interna (`isInternal`) não ganha nem gera mês grátis.

## Fica para quem construir

- Nomes de tabelas e rotas, o formato do código (curto, legível, sem letras confundíveis), a tela exata e os textos
  dos e-mails, dentro das regras acima.
- Se a alternativa de pausa do MP for confirmada no sandbox, usá-la no lugar do estorno.

## Decisões do dono (2026-10-23)

1. O indicado ganha 15 dias a mais de teste (45 no total): sim.
2. Quem indica ganha 1 mês grátis quando o indicado paga a primeira mensalidade, com limite de 12 por ano: sim.
3. Mercado Pago: testar antes a pausa de um ciclo no sandbox. O plano começa por esse teste; o Stripe não depende dele.
