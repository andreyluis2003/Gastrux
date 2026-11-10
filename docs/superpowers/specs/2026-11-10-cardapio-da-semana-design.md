# Cardápio da semana (pedido antecipado para um dia de atendimento)

Data: 2026-11-10. O dono pediu para pular as perguntas e escrever a proposta: as decisões abaixo são minhas
(Claude) salvo onde está escrito "dono".

## Por quê

A cliente Restaurante Maria Clara Liporini Cunha atende **só um dia por semana**, o **cardápio muda toda semana** e
os **clientes encomendam antes** (dono, 2026-11-10). Hoje o Gastrux não cobre isso:

- O cardápio online (link de delivery) só aceita pedido **para agora** e **com a loja aberta**. Uma loja que abre um
  dia por semana fica fechada nos dias em que o cliente quer encomendar.
- Dá para montar o cardápio da semana esgotando e reativando produtos, mas não dá para **deixar a próxima semana
  pronta**.
- **Vender › Encomendas** existe, mas só a equipe lança (o cliente manda mensagem e a dona digita tudo).
- Ninguém soma **quanto fazer de cada prato** a partir das encomendas, que é o que ela precisa para comprar e
  produzir.

Serve também para marmita semanal, congelados, feijoada de sábado, quentinha por encomenda e padaria com dia fixo.

**Medida de sucesso:** restaurantes com cardápio da semana ativo e % das encomendas feitas pelo próprio cliente no
link (em vez de lançadas pela equipe), 30 dias depois do lançamento.

## O que é

Um **cardápio da semana** é: a **data do atendimento** (ex.: sábado 15/11), o **prazo para pedir** (ex.: até
quinta 13/11 às 20h, opcional) e a **lista dos produtos** daquela data, cada um com um **limite de porções**
opcional. Os produtos são os do Cardápio digital, com o preço de lá.

Enquanto houver um cardápio da semana aberto para pedidos, o link de pedidos do restaurante mostra **só ele** e
aceita pedidos **para aquela data**, mesmo com a loja fechada.

## Como a dona usa

1. **Cardápio e produtos › Cardápio da semana** (dono e gerente). Botão **Novo cardápio da semana**: data do
   atendimento, prazo para pedir, e a escolha dos produtos (busca e marcação, como a seleção em massa do Cardápio
   digital). Em cada produto marcado, um campo opcional **Porções** ("20" = aceita até 20).
2. **Copiar de uma semana anterior**: abre um cardápio novo com os mesmos produtos para trocar só o que muda.
3. Pode deixar **várias semanas prontas**. Cada uma abre para pedidos sozinha quando a anterior passa (ver Regras).
4. A tela de cada cardápio da semana mostra:
   - **O que fazer**: total de cada produto somando as encomendas (ex.: "Feijoada: 18 de 20"), com adicionais e
     observações agrupados. Botão **Imprimir**.
   - **Encomendas**: cliente, celular, itens, entrega ou retirada, forma de pagamento e total, com o status de cada
     uma.
5. No dia do atendimento, as encomendas entram no **Quadro de pedidos** como pedidos do dia, e o resto do fluxo é o
   de hoje (cozinha, entrega, Caixa).

## Como o cliente usa

1. Abre o link de pedidos de sempre (o mesmo do delivery). No topo: **"Pedidos para sábado, 15/11 · encomende até
   quinta às 20h"**.
2. Vê só os produtos daquele cardápio. Produto que atingiu o limite aparece **Esgotado**.
3. Faz o pedido como hoje: entrega ou retirada, endereço, forma de pagamento (as formas na entrega/retirada de
   hoje). A confirmação diz a data do atendimento.
4. Depois do prazo, o link mostra **"Pedidos encerrados para sábado, 15/11"** e, se já houver a próxima semana
   pronta, passa a mostrar ela.

## Regras

- **Qual cardápio o link mostra**: o primeiro cardápio da semana cuja data de atendimento ainda não passou e cujo
  prazo ainda não venceu. Sem nenhum: o link funciona como hoje (cardápio normal, loja aberta/fechada).
- **Loja fechada não bloqueia** pedido de cardápio da semana (o pedido é para outro dia). "Fechar a loja" na mão
  continua parando tudo, inclusive o cardápio da semana: é o freio de emergência que a dona já conhece.
- **No dia do atendimento**, se o prazo ainda não venceu, o link aceita pedidos para o próprio dia.
- **Limite de porções**: contado pelas encomendas não canceladas. Conferido no servidor no momento do pedido (dois
  clientes ao mesmo tempo não passam do limite). Cancelar uma encomenda libera as porções.
- **Dias de venda** do produto (já existe) não se aplicam ao cardápio da semana: estar na lista já diz o dia.
- **Estoque, ficha técnica, cashback, cupom**: valem como num pedido de delivery de hoje, aplicados quando o pedido
  entra no dia (não na hora da encomenda).
- **Cancelar**: a dona cancela uma encomenda pela tela do cardápio da semana, com motivo.
- **Editar o cardápio** depois de ter encomendas: pode acrescentar produtos e mudar limites; não pode tirar um
  produto que já tem encomenda (aviso: "Já tem 3 encomendas com este produto").

## O que não é (agora)

- **Pagamento antecipado online** (Pix/cartão na hora da encomenda). Seria o ideal para encomenda, mas depende da
  integração com o Mercado Pago que ainda não está ligada. Fica em "Depois".
- Encomenda pelo **robô do WhatsApp** e lembrete automático para o cliente na véspera.
- Rodízio automático ("a cada 4 semanas volta o primeiro"). O "Copiar de uma semana anterior" cobre o uso real.
- Mais de um dia de atendimento por semana no mesmo cardápio (cada dia é um cardápio da semana separado).
- Encomendas vindas do iFood ou da 99Food.

## Textos para o cliente e a IA (regra do projeto)

- `lib/ai/knowledge/cardapio.ts` (ou o arquivo de delivery, o que o builder achar melhor): o que é, como criar,
  copiar, limite de porções, o que o cliente vê, que loja fechada não bloqueia e "Fechar a loja" bloqueia.
- `lib/help/seed-articles.ts`: artigo "Cardápio da semana: vender por encomenda para um dia" (com o hash antigo, como
  manda a regra).
- Manual de operação (Claude Doc): parágrafo curto.

## Fica para o builder

- O modelo de dados (tabelas novas: cardápio da semana e seus produtos; o pedido guarda a qual pertence). Migração
  só com tabelas e colunas novas opcionais, seguras para o Deploy antes do `migrate deploy`; atenção para não pôr
  coluna nova em tabela lida sem `select` (regra aprendida em 2026-11-09).
- Como a encomenda fica guardada até o dia (pedido agendado ou registro próprio que vira pedido no dia) e a que
  horas do dia ela entra no Quadro, desde que: não apareça como pedido de hoje antes do dia, não baixe estoque antes
  do dia e apareça no Quadro no começo do dia do atendimento.
- O visual das telas, seguindo as atuais (Cardápio digital, Encomendas, link de delivery).
- Plano: o mesmo plano que hoje tem o link de delivery próprio.

## Testes

- Unidade: qual cardápio o link mostra (antes do prazo, depois do prazo, várias semanas, dia do atendimento, sem
  nenhum); conta do limite de porções; soma do "O que fazer".
- Integração: pedido com loja fechada aceito para o cardápio da semana; "Fechar a loja" recusa; produto fora da
  lista recusado; limite atingido recusado (inclusive dois pedidos simultâneos); cancelamento libera porções;
  encomenda não aparece no Quadro antes do dia e aparece no dia; outro restaurante não vê nem mexe.
- Teste real: no homolog, a dona cria o cardápio de um sábado, faz duas encomendas pelo link no celular, confere o
  "O que fazer" e vê as encomendas entrarem no Quadro no dia.

## Depois

- Pagamento antecipado (Pix) na encomenda, quando o Mercado Pago estiver ligado.
- Lembrete por WhatsApp na véspera e "seu pedido saiu".
- Encomenda pelo robô do WhatsApp.
- Planejamento de produção e compras a partir do "O que fazer" (ficha técnica × porções).
