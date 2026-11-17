# Cadastro de entregadores com diária e valor por entrega (aprovado em 2026-11-17)

Data: 2026-11-17. Pedido do dono: "Cadastro de entregadores com taxa fixa por entrega", seguindo o que o mercado
pratica. Abordagem escolhida pelo dono: **A** (dentro do Acerto do entregador que já existe).

## Por que

Hoje (acerto do entregador, spec 2026-10-26, no ar desde b209a4d) o entregador é um nome digitado em "Saiu para
entrega" e o pagamento dele é um valor que o caixa digita no acerto. Ninguém calcula quanto ele ganhou, e o acerto
só enxerga os pedidos **pagos na entrega**: as entregas pagas online (PIX/cartão no site) e as do WhatsApp não
aparecem, então o entregador que levou 10 pedidos aparece com 4.

O mercado paga o motoboy por **diária**, por **valor fixo por entrega**, ou pelos dois (referências: diária ~R$ 40,
entrega R$ 7–15), e faz o **acerto no fim do dia, com baixa no caixa**; os sistemas concorrentes (Saipos,
CardápioWeb, Alterdata) têm cadastro de entregadores, histórico de entregas e ganhos por período.

Sucesso: no fim da noite o caixa abre o acerto, vê cada entregador com **todas** as entregas que ele fez, o valor a
pagar já calculado (diária + entregas × valor), confere o dinheiro dos pedidos pagos na porta e paga, num passo só.
O dono vê no relatório quanto cada entregador recebeu no mês.

## Objetivos

1. **Cadastro de entregadores**: nome, celular (opcional), diária (opcional), valor por entrega (opcional), ativo.
2. **Quem levou** escolhido numa lista (cadastrados ativos) nos dois lugares onde há entrega própria:
   - Pedidos de delivery, ao marcar "Saiu para entrega" (site, iFood/99Food com entrega própria);
   - comandas de entrega do WhatsApp (e venda balcão marcada como entrega, se existir esse caminho), no Vender.
3. **Acerto do entregador** passa a mostrar, por entregador, **todas as entregas ainda não pagas a ele** (pagas na
   porta ou online), e calcula o pagamento: diária (uma vez por dia em que ele entregou) + nº de entregas × valor
   por entrega. Continua conferindo o dinheiro dos pedidos pagos na porta como hoje.
4. **Relatório de entregadores** por período: por entregador, nº de entregas, diárias, total pago.

## Fora (não-objetivos)

- Pagamento por distância/bairro, taxa diferente por região, gorjeta, vale-combustível.
- Login do entregador, app do entregador, rastreio, roteirização.
- Repassar automaticamente a taxa de entrega cobrada do cliente (quem quiser isso põe o valor por entrega igual à
  taxa).
- Pagamento por PIX ao entregador pelo sistema (o pagamento continua sendo uma Despesa em dinheiro no turno, como
  hoje; quem paga por PIX lança a forma "Outro"? — ver "Deixado ao builder").
- Vínculo trabalhista, recibo assinado, impostos.

## Anti-objetivos (seria falha mesmo funcionando)

- Pagar duas vezes a mesma entrega ou a mesma diária (dois acertos, dois aparelhos, acerto refeito).
- Contar entrega que não aconteceu: pedido cancelado/recusado, retirada no balcão, entrega feita pelo iFood.
- Quebrar o acerto que já funciona: pedidos antigos com nome digitado continuam aparecendo e sendo acertados.
- Receita em dobro ou dinheiro sumindo da gaveta (as regras de lançamento do acerto de hoje continuam).

## Restrições

- Next.js 14 + Prisma + Postgres; tudo filtrado por `restaurantId`; textos em português simples.
- Cadastro e edição de entregadores: dono e gerente. Escolher o entregador e fazer o acerto: quem já faz hoje
  (caixa ou acima no acerto; quem marca "Saiu para entrega" em Pedidos de delivery).
- Valores em centavos (`Int`), como o resto do caixa.
- Cada recurso atualiza `lib/ai/knowledge/*.ts` e `lib/help/seed-articles.ts` (com o hash antigo do artigo do acerto
  na lista de hashes antigos); sobras vão inteiras para `docs/pendencias.md`.
- Migração nova em tabelas existentes → Deploy e `npx prisma migrate deploy` em seguida (homolog, depois app).

## Abordagens consideradas

- **A. Dentro do Acerto do entregador (escolhida pelo dono).** Um passo só no fim da noite: conferir o dinheiro e
  pagar o entregador, com o valor calculado. Custo: o acerto fica mais carregado (duas partes: "dinheiro dos
  pedidos" e "pagamento").
- **B. Tela separada "Pagamento de entregadores".** Mais simples de construir, mas o caixa faz duas coisas no fim da
  noite e pode esquecer uma.
- (Descartada) Só relatório, sem pagar pelo caixa: não dá baixa no caixa, que é justamente o que o mercado faz.

## Como funciona (decidido)

### 1. Cadastro

Tela **Entregadores** (dono/gerente), perto de onde o restaurante cuida do delivery (minha escolha: Caixa e
pagamentos › Entregadores, ao lado do acerto; o builder pode pôr no menu de Pedidos de delivery se ficar mais
natural). Campos: nome (obrigatório, único entre os ativos do restaurante), celular (opcional), diária em R$
(opcional, 0 = sem diária), valor por entrega em R$ (opcional, 0 = sem valor por entrega), ativo. Entregador não se
apaga: desativa (some da lista de escolha, continua no histórico e nos relatórios). Mudar o valor vale para as
entregas **ainda não pagas** (o valor é lido na hora do acerto) — minha escolha, mais simples; anotar em pendências.

### 2. Quem levou

- **Pedidos de delivery › Saiu para entrega**: o campo de nome vira uma lista dos entregadores ativos, com a opção
  "Outro (digitar nome)" para não travar quem ainda não cadastrou. O pedido guarda o entregador (`driverId`) e,
  como hoje, o nome.
- **Comanda de entrega do WhatsApp** (no Vender, aba Delivery, e/ou na Conta dessa comanda): botão "Entregador"
  com a mesma lista. Só aparece em comanda que é entrega (WhatsApp com tipo entrega; o builder confirma se a venda
  balcão tem marcação de entrega e, se tiver, inclui).
- Trocar o entregador é permitido enquanto a entrega não foi paga a ele.
- iFood/99Food com entrega feita pela plataforma não pedem entregador (já é assim) e nunca contam.

### 3. Acerto do entregador (Caixa, turno aberto)

Por entregador (cadastrado; nomes digitados sem cadastro ficam agrupados pelo nome, como hoje; "Sem nome" continua):

- **Dinheiro dos pedidos** (como hoje): só os pedidos pagos na entrega e ainda não acertados; o caixa digita quanto
  recebeu; diferença com motivo.
- **Pagamento do entregador** (novo cálculo): entregas ainda não pagas a ele = todos os pedidos/comandas de entrega
  com esse entregador, entregues ou saídos, não cancelados, de qualquer forma de pagamento, ainda sem pagamento de
  entregador. Valor sugerido = diária × dias distintos (dia de calendário no fuso do restaurante, pela data de saída
  da entrega) em que ele tem entrega e ainda não recebeu diária + nº de entregas × valor por entrega. O caixa vê a
  conta ("2 diárias × R$ 40 + 14 entregas × R$ 8 = R$ 192") e pode ajustar o valor: até o sugerido, o caixa paga;
  acima do sugerido, só gerente (substitui a regra de hoje "até a soma das taxas de entrega"). Entregador sem
  cadastro (nome digitado): sem sugestão, valor digitado, e a regra antiga (até as taxas de entrega) continua.
- As duas partes são independentes na tela: dá para só conferir o dinheiro, só pagar, ou os dois, num mesmo
  "Confirmar acerto". Pagar marca as entregas e as diárias como pagas (ligadas ao acerto), para nunca pagar duas
  vezes; um segundo acerto ao mesmo tempo das mesmas entregas é recusado (409), como hoje.
- O lançamento continua uma Despesa "entregador" em dinheiro no turno aberto.

### 4. Relatório

Em Relatórios, **Entregadores**: período (padrão: mês atual), por entregador: entregas, diárias, total pago,
total ainda a pagar. Pagos = os acertos com pagamento no período; a pagar = entregas sem pagamento. Exportar CSV se
o padrão dos outros relatórios tiver; senão não.

## Respostas à leitura do construtor (minhas escolhas, marcadas para o dono conferir)

1. **Comanda de entrega do WhatsApp.** Hoje não tem marca de "saiu": a comanda é de entrega quando a conversa do
   WhatsApp ligada a ela tem `orderType = DELIVERY`. Entra um passo **"Saiu para entrega"** nessas comandas (no Vender,
   aba Delivery, e na Conta dela): escolhe o entregador e grava `driverId` + `dispatchedAt`. Conta como entrega só
   depois desse passo e se a comanda não estiver CANCELLED. A venda balcão não tem marca de entrega hoje: fica fora
   (pendência). O robô não cobra taxa de entrega: essas comandas têm taxa 0.
2. **Teto do pagamento.** Entregador cadastrado: o caixa paga até o valor sugerido; acima, só gerente. Entregador
   só com nome digitado: sem sugestão, teto do caixa = soma das taxas de entrega cobradas nas entregas dele ainda não
   pagas (comandas do WhatsApp somam 0); acima, só gerente.
3. **Gaveta sem dinheiro.** O pagamento continua uma Despesa em dinheiro no turno aberto, mesmo que deixe o esperado
   da gaveta negativo; a tela avisa "O esperado em dinheiro fica negativo" e deixa seguir. As duas partes do acerto
   exigem turno aberto, como hoje.
4. **Dia da diária.** "Dia de trabalho" que vira às 05:00 no fuso do restaurante (entrega que saiu à 01:30 conta no
   dia anterior), para a noite que passa da meia-noite não virar duas diárias. Uma diária por entregador por dia de
   trabalho, com trava no banco contra pagar o mesmo dia duas vezes. Entrega cancelada depois de paga: nada é
   desfeito (pendência; um gerente ajusta no caixa).
5. **Modelo do pagamento.** O pagamento do entregador fica numa tabela própria (`DriverPayment`, ligada ao acerto
   quando feito junto), em vez de reaproveitar os campos de dinheiro do `DeliverySettlement`; "dinheiro acertado"
   (`settlementId`) e "entrega paga ao entregador" (`driverPaymentId`) são marcas separadas na entrega. O acerto de
   dinheiro de hoje não muda de regra.
6. **Nomes antigos.** Cadastrar "João" não junta com os pedidos antigos digitados "João": eles continuam agrupados
   pelo nome, com a regra antiga. Trocar o entregador de uma entrega já paga a ele: não.
7. **iFood/99Food.** Conta quando a entrega é do restaurante (o pedido tem entregador escolhido, o que só acontece em
   "Saiu para entrega", que já não aparece para entrega feita pela plataforma) e o status é Saiu ou Entregue (não
   precisa ter sido marcado Entregue).
8. **Relatório.** "Pago" = pagamentos feitos dentro do período (data do pagamento); "a pagar" = entregas do período
   ainda não pagas. Inclui entregadores desativados e, numa linha por nome, os nomes digitados sem cadastro.
9. **Nome único** entre os ativos do mesmo restaurante: conferido no servidor (sem índice parcial).

## Deixado ao builder

- Modelo de dados exato. Sugestão: `Driver` (restaurantId, name, phone?, dailyRateCents, perDeliveryCents, active);
  `ExternalOrder.driverId?` e o mesmo na comanda de entrega (`OrderSession.driverId?` + quando saiu); um registro de
  pagamento ligado ao acerto que marca as entregas e as diárias pagas (ex.: `DeliverySettlement` ganha `driverId`,
  `dailyCount`, `deliveryCount`; entregas ganham `driverPaidSettlementId`; diárias pagas por (driverId, dia) com
  unicidade para impedir pagar o mesmo dia duas vezes).
- Onde exatamente fica o botão "Entregador" na comanda de entrega do WhatsApp.
- Pagamento ao entregador por PIX: hoje é Despesa em dinheiro; se a Despesa já aceitar outra forma, usar; senão
  deixar em dinheiro e anotar em pendências.
- Fuso e "dia" da diária: usar o fuso do restaurante já usado nos relatórios.
