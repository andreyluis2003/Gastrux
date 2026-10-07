# Tela Vender (mesas, comanda rápida, conta, transferir e juntar) — Design

**Data:** 2026-10-07
**Status:** design aprovado em chat (4 partes), aguardando revisão deste documento
**Origem:** pesquisa de concorrentes de 2026-10-04 (Consumer, Anota AI, Goomer), backlog item 6. Segundo subprojeto da reorganização, depois do caixa com turnos (`2026-10-04-caixa-turnos-design.md`, já em produção).

## 1. Problema

Vender é o que o restaurante faz o dia inteiro, e hoje o fluxo tem passos demais:

- **`/comanda` não mostra as mesas.** Há "Nova Comanda", "Venda balcão" e a lista de comandas abertas; as mesas só aparecem dentro do formulário de abrir comanda. Não dá para ver de relance o salão (livre, ocupada, pediu a conta).
- **Lançar um item leva 3 a 4 toques**: escolher o item, digitar a quantidade, marcar adicionais, "Adicionar". O cardápio é uma grade única, **sem categorias**.
- **Não há campo de observação** ("sem cebola") na comanda, embora o banco (`OrderSessionItem.specialInstructions`) e a cozinha (`components/kds/kds-order-card.tsx`) já tratem observação.
- **Faltam recursos de mercado:** taxa de serviço, pré-conta, dividir a conta, pagamento parcial por pessoa, transferir e juntar mesas.
- "Emitir NFC-e" é um botão solto na comanda, ao lado de "Fechar conta".

A Consumer, líder no segmento, tem **uma tela só**: mapa de mesas e comandas (cinza livre, verde ocupada) com o balcão na mesma grade, delivery em aba, abrir/fechar caixa na própria tela. O Anota AI lança e fecha com poucos toques e tem garçom pelo navegador do celular.

## 2. Objetivo e critério de sucesso

Abrir uma mesa, lançar os pedidos e fechar a conta com o **mínimo de toques**, numa tela que um funcionário novo entende sem treinamento.

**Sucesso:**
- mesa livre → comanda aberta: **1 toque**;
- lançar uma unidade de um item sem adicional: **1 toque**;
- da comanda ao pagamento recebido em PIX: **Conta → PIX → Confirmar** (3 toques);
- o salão inteiro visível de relance, com total e tempo de cada mesa.

**Para quem:** garçom no **celular**, na mesa; caixa no **computador ou tablet** do balcão (decisão do dono). O mesmo aplicativo nos dois, adaptado ao tamanho da tela. Papéis como hoje: `CASHIER` (atendimento e caixa), `MANAGER`, `OWNER`; `COOK` não vende.

## 3. Decisões do dono (2026-10-07)

1. Abordagem A: **uma tela principal de vendas**, no modelo da Consumer (não dois aplicativos, não só remendos).
2. Público: **garçom no celular e caixa no computador/tablet**.
3. Primeira versão inclui **taxa de serviço, observação por item, pré-conta, transferir/juntar/dividir**.
4. Entrega em **três etapas**, cada uma testada e publicada sozinha (seção 10).
5. Comanda: **um toque lança 1 unidade** com "Desfazer"; itens enviados à cozinha **não se editam** (remover só com motivo, regra atual); depois de enviar, **o celular volta ao mapa** e o computador continua na comanda; **NFC-e sai da comanda e vai para a Conta**.

## 4. Telas

### 4.1 `/vender` — mapa de mesas e balcão (etapa 1)

Novo endereço; `/comanda` passa a redirecionar para `/vender` (links antigos e o app instalado continuam funcionando). No menu, o grupo **Vender** começa com **"Mesas e balcão"** → `/vender`. Ao entrar no sistema, `CASHIER` cai em `/vender`; `OWNER` e `MANAGER` continuam no Início (`/dashboard`).

De cima para baixo:

1. **Barra do caixa**, sempre visível, reaproveitando `lib/caixa/use-device-shift.ts`:
   - verde: "Caixa aberto · <nome do caixa> · desde HH:MM" (toque → `/caixa`);
   - amarela: "Caixa fechado · [Abrir caixa]" (abre o diálogo de abertura que já existe, `OpenShiftCard`). Quem não pode abrir caixa vê só o aviso.
2. **Ações:** [+ Comanda por nome] (pede só o nome e abre) e [Venda balcão] (componente atual `components/comanda/counter-sale.tsx`, paga na hora, funciona offline).
3. **Abas:** "Mesas" e "Delivery (N)". Delivery leva à tela existente de pedidos (`/admin/integrations/orders`), com o contador de pedidos novos; o delivery não é refeito agora.
4. **Abas por salão** (`TableSection`), só quando houver mais de um, mais "Todas".
5. **Mapa de mesas**, quadrados grandes (alvo de toque ≥ 64 px), ordenados por número:
   - **cinza**: livre;
   - **verde**: ocupada — número, total parcial e tempo aberto ("R$ 84,50 · 47 min");
   - **amarelo**: pré-conta impressa (etapa 2).
6. **Comandas por nome e de balcão abertas**, logo abaixo, no mesmo formato (nome, total, tempo).

**Toques:** mesa livre → abre a comanda e entra nela (1 toque, sem formulário); mesa ocupada ou comanda → entra na comanda.

**Atualização:** a cada 10 s enquanto a aba estiver visível (pausa quando escondida). **Offline:** mostra o último estado com o aviso amarelo que já existe; abrir comanda nova pede internet (regra atual), a venda balcão continua offline.

### 4.2 `/vender/[sessionId]` — comanda rápida (etapa 1)

`/comanda/[sessionId]` redireciona para cá.

**Topo:** "Mesa 5 · aberta há 47 min · <quem abriu>" e o botão **⋯** (menu da mesa: Pré-conta na etapa 2, Transferir/Juntar/Transferir itens na etapa 3).

**Cardápio:** abas por categoria do cardápio (`MenuCategory`, na ordem `position`) e busca. Cada item é um botão grande com nome e preço.
- **Toque:** lança 1 unidade na hora; aviso "Calabresa +1 · [Desfazer]" por 5 s. Toques seguintes no mesmo item **somam na mesma linha nova** se ela não tiver adicionais nem observação; senão, criam outra linha.
- **Segurar (500 ms) ou o "⋯" no canto do botão:** abre a ficha do item **antes** de lançar.

**Ficha do item** (painel que sobe de baixo no celular, janela no computador): quantidade com − e +, adicionais (`ItemModifier`, agrupados por `category`, como hoje), observação (texto livre, até 140 caracteres), e [Lançar] / [Salvar] / [Remover].

**Comanda (lista):**
- **Itens novos** (`addedAt > sentToKitchenAt`, a mesma regra de `lib/kds/send-session.ts`) marcados "a enviar"; tocar na linha abre a ficha para editar.
- **Itens enviados** marcados "na cozinha · HH:MM"; tocar mostra só os detalhes e **[Remover com motivo]** (regra atual: gerente, motivo, auditoria).
- **Total** dos itens (sem taxa de serviço).

**Botões:** [Enviar para cozinha (N)] (N = itens novos; desabilitado com 0) e [Conta].

**Tamanho de tela:**
- ≥ 1024 px: cardápio à esquerda, comanda fixa à direita.
- < 1024 px: cardápio em tela cheia; **barra fixa embaixo** "N itens · R$ total · [Enviar (N)] · [Ver comanda]"; a comanda abre por cima, de baixo para cima.

**Depois de enviar:** aviso "Enviado para a cozinha"; < 1024 px volta para `/vender`; ≥ 1024 px fica na comanda.

### 4.3 Conta (etapa 2)

Aberta por [Conta]: tela cheia no celular, janela grande no computador. Substitui o diálogo atual "Fechar conta" e o botão "Emitir NFC-e" da comanda.

**Conteúdo:** itens, **subtotal**, **taxa de serviço** (marcada por padrão, com "Cliente não quer pagar a taxa" para desmarcar), **total**, **pago até agora** e **falta**.

**Taxa de serviço:**
- `Restaurant.serviceChargePercent` (padrão 10; 0 desliga e esconde a linha), editável em Configurações por gerente/dono.
- Só para mesa e comanda por nome; **balcão e delivery nunca têm taxa**.
- Calculada sobre o subtotal dos itens, arredondada ao centavo; gravada na comanda ao fechar (`OrderSession.serviceChargeCents`, 0 se desmarcada).
- Não entra na comissão (`lib/staff/commissions.ts` já usa só os itens) nem na NFC-e (ver 4.5).

**Pré-conta:** [Imprimir pré-conta] imprime itens, subtotal, taxa, total e, se houver divisão escolhida, o valor por pessoa, com "NÃO É DOCUMENTO FISCAL". Grava `OrderSession.preBillPrintedAt`; a mesa fica amarela no mapa. Lançar item depois disso limpa `preBillPrintedAt` (volta a verde). Qualquer pessoa do atendimento imprime.

**Dividir:**
- **Igualmente:** "Dividir por [N]" (2 a 20) mostra o valor por pessoa; o último absorve o centavo que sobra.
- **Por item:** marcar itens; mostra quanto essa pessoa paga (itens + taxa proporcional, se a taxa estiver marcada).
- A divisão só sugere o valor do próximo pagamento; quem decide quanto pagar é o operador.

**Pagamentos parciais:**
- Cada pagamento (formas de `lib/caixa/payment-methods.ts`; troco só em dinheiro, como hoje) é registrado **na hora** no turno aberto, como `CashSessionEntry` `RECEIPT` com `orderSessionId`, sem fechar a comanda.
- A tela mostra a lista "R$ 46,20 · PIX · 21:14" e "Falta R$ 46,20".
- **Quando o pago atinge o total, a comanda fecha sozinha** (mesma transação): status `CLOSED`, `closedAt`, `serviceChargeCents`, mesa liberada, NFC-e se a emissão automática estiver ligada, cupom para imprimir.
- Pagar mais que o falta só é aceito em dinheiro (vira troco).
- **Estornar um pagamento parcial** (comanda ainda aberta): gerente, com motivo; lançamento `REFUND` no turno e auditoria.
- Receber exige **caixa aberto** (regra atual).
- Mudar a taxa (marcar/desmarcar) depois de haver pagamento parcial é permitido; o "falta" é recalculado. Se o pago já passar do novo total, só gerente desmarca, e o excedente precisa de estorno.

### 4.4 Transferir, juntar e transferir itens (etapa 3)

No menu **⋯** da comanda:

- **Transferir mesa** (Mesa 5 → 8): a comanda inteira (itens, pagamentos, tempo, pré-conta) passa para a mesa 8; a 5 fica livre. Se a 8 estiver ocupada: "A mesa 8 já tem comanda. Juntar as duas?".
- **Juntar** ("Juntar Mesa 6 nesta"): itens e pagamentos parciais da comanda da 6 passam para esta; a comanda da 6 fica `CANCELLED` com `mergedIntoId` apontando para esta (aparece no histórico como "juntada à mesa 5"); a 6 fica livre.
- **Transferir itens:** marcar itens (novos ou enviados) e escolher a mesa ou comanda de destino (abre uma se a mesa estiver livre). Itens enviados continuam enviados (preservam `addedAt`; o destino não reenvia o que a cozinha já tem — ver 7).
- Comanda destino ou origem **fechada** ou **cancelada** não participa.
- **Quem:** qualquer pessoa do atendimento. **Tudo auditado** (`recordAudit`: origem, destino, itens, quem).
- **Fora:** desfazer junção automaticamente (transferir itens de volta resolve).

**Cozinha:** o KDS lê a mesa pela comanda (`order.orderSession.table`), então o cartão passa a mostrar a mesa nova sem mudança no KDS. **Verificar na etapa 3:** `OrderSession.orderId` é único, então só o último pedido enviado fica ligado à comanda; se os pedidos anteriores perderem a mesa no KDS, ligar cada `Order` à comanda (campo `orderSessionId` em `Order`) faz parte da etapa 3.

### 4.5 NFC-e

- Emitida **na Conta**, ao fechar (automática, se ligada) ou pelo botão [Emitir NFC-e] da Conta depois de fechada (regra atual de `POST /api/nfe/emit`). Uma nota para a conta inteira, com CPF opcional.
- **Taxa de serviço fora da nota** (gorjeta, Lei 13.419/2017, não é receita do restaurante). **Confirmar com o contador** na mensagem pendente; se ele mandar incluir, entra como "outras despesas" (`vOutro`) numa mudança à parte.
- Nota por pessoa: fora deste subprojeto.

## 5. Dados

Etapa 1 não muda o banco. Etapa 2: `serviceChargePercent`, `serviceChargeCents`, `preBillPrintedAt`. Etapa 3: `mergedIntoId`, `OrderSessionItem.sentAt` (seção 7) e, se a verificação de 4.4 pedir, `Order.orderSessionId`.

```prisma
model Restaurant {
  // ...
  /// Taxa de serviço sugerida na Conta (mesa e comanda por nome); 0 desliga
  serviceChargePercent Int @default(10)
}

model OrderSession {
  // ...
  /// Taxa de serviço cobrada, gravada ao fechar (0 = não cobrada)
  serviceChargeCents Int       @default(0)
  /// Pré-conta impressa (mesa "pediu a conta"); limpa quando entra item novo
  preBillPrintedAt   DateTime?
  /// Etapa 3: comanda juntada a outra
  mergedIntoId       String?
}

model OrderSessionItem {
  // ...
  /// Etapa 3: quando a cozinha recebeu este item (nulo = novo, "a enviar")
  sentAt DateTime?
}
```

Pagamentos parciais usam `CashSessionEntry` (`orderSessionId`, `RECEIPT`/`CHANGE`/`REFUND`), que já existe.

## 6. API

Etapa 1:
- `GET /api/vender/salao` — mesas (com salão) e comandas abertas do restaurante, cada uma com total parcial, `openedAt`, quantidade de itens novos e `preBillPrintedAt`. Uma chamada para o mapa inteiro.
- `PUT /api/comanda/sessions/[id]/items/[itemId]` — já aceita `quantity` e `specialInstructions`; passa a aceitar `modifierIds` em **item ainda não enviado** (item enviado: 409).
- Demais rotas existentes sem mudança: abrir comanda, lançar item (`POST .../items`), remover, enviar para cozinha, venda balcão.

Etapa 2:
- `POST /api/comanda/sessions/[id]/pre-bill` — grava `preBillPrintedAt`, devolve o que imprimir.
- `POST /api/comanda/sessions/[id]/payments` — `{ payments: [...], serviceCharge: boolean, cpf? }`: registra pagamentos parciais; fecha a comanda quando quita (mesma transação, com o bloqueio do turno de `lib/caixa/sale.ts`).
- `POST /api/comanda/sessions/[id]/payments/[entryId]/refund` — gerente, `{ reason }`.
- `PUT /api/comanda/sessions/[id]` com `status: CLOSED` continua aceito (compatibilidade com o app offline); passa a aceitar `serviceCharge`.
- `PATCH /api/restaurant/settings` (ou rota de configurações existente) — `serviceChargePercent`, gerente/dono.

Etapa 3:
- `POST /api/comanda/sessions/[id]/transfer` — `{ tableId }` ou `{ targetSessionId }`.
- `POST /api/comanda/sessions/[id]/merge` — `{ sourceSessionId }`.
- `POST /api/comanda/sessions/[id]/move-items` — `{ itemIds, tableId | targetSessionId }`.

Todas com `getCurrentRestaurantId()`/membro do restaurante, escopo por `restaurantId` em toda consulta, e idempotentes (`idempotent()`) como as rotas atuais da comanda.

## 7. Regras e casos difíceis

- **Itens enviados ao transferir:** a regra atual "novo = `addedAt > sentToKitchenAt`" é por comanda; um item enviado movido para outra comanda pareceria novo e seria reenviado. Na etapa 3 cada item passa a ter **`OrderSessionItem.sentAt`** (quando a cozinha o recebeu): `lib/kds/send-session.ts` envia os itens com `sentAt` nulo e os marca; a migração preenche `sentAt = sentToKitchenAt` da comanda para os itens com `addedAt <= sentToKitchenAt`. Mover um item leva o `sentAt` junto, então ele nunca é reenviado. A regra de remover/editar ("item enviado") passa a olhar `sentAt`.
- **Dois aparelhos** lançando na mesma comanda: lançamentos são independentes (já são); pagamento e fechamento usam a transação com bloqueio que existe.
- **Dois garçons abrindo a mesma mesa livre** ao mesmo tempo: o segundo entra na comanda que o primeiro abriu (abrir comanda passa a ser "abrir ou devolver a aberta" para a mesa).
- **Desfazer** um lançamento de 1 toque: remove a linha se ainda não foi enviada; se já foi enviada nesse intervalo, cai na regra de remover com motivo.
- **Arredondamento:** tudo em centavos inteiros (`lineTotalCents`, `lib/comanda/session-total.ts`).
- **Offline:** lançar item, editar item novo e enviar à cozinha seguem pela fila offline atual; pagamento parcial, pré-conta, transferir e juntar pedem internet (aviso claro).

## 8. Fora deste subprojeto

Refazer a tela de delivery; nota fiscal por pessoa; atalhos de teclado no computador (podem vir depois, sobre esta tela); adicionais vinculados a itens específicos (hoje todos os adicionais valem para todos os itens); mapa de mesas com desenho livre (posição x/y); gorjeta digitada à parte.

## 9. Testes

- **Unitários (puros):** taxa de serviço (percentual, desmarcada, arredondamento, balcão sem taxa); divisão igual (centavo que sobra) e por item (taxa proporcional); "falta" com pagamentos e troco; cor/estado da mesa (livre, ocupada, pré-conta, volta a verde com item novo); agrupamento do cardápio por categoria; regra de soma na mesma linha.
- **Integração (banco de teste):**
  - `GET /api/vender/salao`: só o restaurante logado, totais e estados corretos.
  - Editar item novo (quantidade, adicionais, observação) e recusa em item enviado.
  - Pagamentos parciais até quitar → comanda fecha uma vez, entradas no turno, taxa gravada; estorno só gerente; caixa fechado recusa.
  - Pré-conta grava e limpa com item novo.
  - Transferir, juntar e mover itens: totais, pagamentos, mesas liberadas, auditoria, outro restaurante recusado (404), itens enviados não reenviados.
  - Isolamento: as rotas novas entram automaticamente na varredura `__tests__/integration/multi-tenant/read-isolation.test.ts`.
- **Navegador (homolog):** fluxo completo no celular (390 px) e no computador (1280 px): abrir mesa, lançar com toque, observação, enviar, voltar ao mapa, conta com taxa, dividir por 2, dois pagamentos, fechar, NFC-e de homologação.

## 10. Entrega

Cada etapa: testes passando, `tsc` limpo, publicada na `main`, deploy no homolog conferido no navegador, depois produção.

1. **Etapa 1 — Tela Vender e comanda rápida:** 4.1, 4.2, `GET /api/vender/salao`, edição de adicionais no item, redirecionamentos e menu. Sem migração. O fechamento de conta continua o diálogo atual até a etapa 2.
2. **Etapa 2 — Conta:** 4.3, 4.5, migração de `serviceChargePercent`, `serviceChargeCents`, `preBillPrintedAt`; configurações da taxa; pré-conta impressa.
3. **Etapa 3 — Mesas:** 4.4, migração de `mergedIntoId` e `OrderSessionItem.sentAt` (seção 7), mais `Order.orderSessionId` se a verificação de 4.4 pedir.

Manual (Claude Doc) atualizado a cada etapa: seção de vendas e o roteiro de onboarding.
