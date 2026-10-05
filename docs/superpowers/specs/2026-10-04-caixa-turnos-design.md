# Caixa com turnos (abertura, vendas, sangria, fechamento às cegas) — Design

**Data:** 2026-10-04
**Status:** design aprovado em chat (5 partes), aguardando revisão deste documento
**Origem:** pesquisa de concorrentes de 2026-10-04 (Consumer, Goomer, Anota AI), backlog item 6. Primeiro subprojeto da reorganização do Gastrux; os seguintes (tela principal de vendas, menu em grupos, endereço no cadastro) terão especificação própria.

## 1. Problema

O Gastrux não tem tela de caixa. Existem o modelo `CashRegister` (com `CashMovement` e `CashTransaction`) e as rotas `app/api/caixa/*`, mas:

- **Nenhuma tela usa o caixa.** O operador não abre, não faz sangria, não fecha.
- **Nenhuma venda entra no caixa.** Fechar comanda (`PUT /api/comanda/sessions/[id]` com `status: CLOSED`) e a venda de balcão (`POST /api/comanda/quick-sale`) guardam a forma de pagamento só para a NFC-e. Não há registro do que foi recebido, em qual forma, por quem.
- O modelo mistura o **caixa físico** e o **turno** (`openedAt`, `closedAt`, saldos no próprio `CashRegister`): reabrir apagaria o histórico.
- O fechamento de conta aceita uma única forma de pagamento e não calcula troco.

Os concorrentes (Consumer em especial) têm: botão "Abrir/fechar caixa" com troco inicial, entradas e saídas com categoria, sangria e suprimento com comprovante impresso, fechamento com conferência e histórico de caixas.

## 2. Objetivo e critério de sucesso

O operador abre o caixa com o troco, as vendas pagas na hora entram sozinhas, ele registra sangria e suprimento com comprovante, e no fim do turno fecha contando o dinheiro **sem ver o esperado**. O sistema então mostra esperado × contado × diferença por forma de pagamento, e o dono recebe alerta quando a diferença passa do limite. Gerente e dono consultam o histórico de turnos.

**Sucesso:** no fim do turno, o sistema mostra quanto deveria haver em dinheiro, PIX, crédito, débito e outros, e a diferença para o contado, sem planilha.

**Para quem:** operador de caixa (`CASHIER`), gerente (`MANAGER`), dono (`OWNER`); `ADMIN` da plataforma como hoje.

## 3. Decisões do dono (2026-10-04)

1. **Venda paga na hora exige caixa aberto** (fechar comanda, balcão, venda rápida). Pedidos online pagos no site pelo Mercado Pago não dependem de caixa e não entram na gaveta.
2. **Fechamento às cegas:** o operador informa o contado sem ver o esperado; só depois de confirmar vê a diferença. Alerta para o dono acima do limite.
3. **Caixas com nome** ("Caixa principal", "Caixa Balcão"), um turno aberto por vez em cada um; cada aparelho escolhe o seu caixa e o sistema lembra. Restaurante com um caixa só não vê a escolha.
4. **Vários pagamentos no mesmo fechamento**, com troco no dinheiro. Divisão da conta por pessoa fica para o subprojeto da tela de vendas.
5. **Abordagem técnica 1:** o turno vira um registro próprio; movimentos e recebimentos pertencem ao turno.

## 4. Dados

### 4.1 Modelos

**`CashRegister` (existente, simplificado)** — o ponto de venda.
- Mantém: `id`, `name`, `description`, `active`, `restaurantId`, `createdAt`, `updatedAt`.
- `restaurantId` passa a ser obrigatório.
- Os campos de turno (`openingBalance`, `expectedBalance`, `actualBalance`, `openedAt`, `closedAt`) deixam de ser usados e são removidos na migração (nenhuma tela os usava; ver §4.3).
- Novo: `isDefault Boolean @default(false)` para o "Caixa principal".

**`CashSession` (novo)** — um turno.
| Campo | Tipo | Observação |
|---|---|---|
| `id` | cuid | |
| `restaurantId` | String | escopo de todas as consultas |
| `cashRegisterId` | String | FK `CashRegister` |
| `status` | enum `OPEN` / `CLOSED` | |
| `openedById` | String | usuário |
| `openedAt` | DateTime | |
| `openingFloatCents` | Int | troco inicial, em centavos |
| `closedById` | String? | |
| `closedAt` | DateTime? | |
| `countedCents` | Json? | `{ dinheiro, pix, credito, debito, outros }` em centavos |
| `expectedCents` | Json? | mesmo formato, calculado no fechamento |
| `differenceCents` | Json? | contado − esperado, por forma |
| `closingNotes` | String? | |
| `lateEntries` | Int `@default(0)` | lançamentos recebidos depois do fechamento (offline) |
| `createdAt`, `updatedAt` | | |

Índice único parcial: **um `OPEN` por `cashRegisterId`** (`CREATE UNIQUE INDEX ... WHERE status = 'OPEN'`, em SQL na migração, porque o Prisma não expressa índice parcial). Índices em `restaurantId`, `cashRegisterId`, `openedAt`.

**`CashSessionEntry` (novo; substitui `CashMovement` e `CashTransaction`)** — um lançamento do turno.
| Campo | Tipo | Observação |
|---|---|---|
| `id` | cuid | |
| `restaurantId` | String | |
| `cashSessionId` | String | FK `CashSession` |
| `type` | enum `RECEIPT` / `CHANGE` / `WITHDRAWAL` / `SUPPLY` / `EXPENSE` / `REFUND` / `ADJUSTMENT` | recebimento, troco, sangria, suprimento, despesa, estorno, ajuste |
| `method` | enum `CASH` / `PIX` / `CREDIT` / `DEBIT` / `OTHER` | forma afetada |
| `amountCents` | Int | sempre positivo; o sinal vem do tipo (§5.4) |
| `category` | String? | despesa: `compras`, `entregador`, `outros` |
| `description` | String? | motivo |
| `orderSessionId` | String? | venda de origem (comanda) |
| `createdById` | String | usuário |
| `direction` | enum `IN` / `OUT`, opcional | obrigatório só em `ADJUSTMENT` |
| `afterClose` | Boolean `@default(false)` | chegou depois do fechamento (offline) |
| `createdAt` | DateTime | |

Índices em `cashSessionId`, `restaurantId`, `orderSessionId`.

### 4.2 Formas de pagamento

Valores aceitos na API e na UI: `dinheiro`, `pix`, `cartao de credito`, `cartao de debito`, `outros` (os mesmos textos que `lib/nfe/focus-nfe-client.ts` já mapeia), traduzidos para o enum `method`. Um único módulo (`lib/caixa/payment-methods.ts`) faz a tradução nos dois sentidos.

### 4.3 Migração

- Cria `CashSession`, `CashSessionEntry`, os enums e o índice parcial.
- Para cada restaurante sem `CashRegister`, cria o "Caixa principal" (`isDefault = true`); se já houver caixas, marca o mais antigo como padrão.
- `CashMovement` e `CashTransaction` existentes (nenhuma tela os criava; esperado zero linhas em produção) são **conferidos** antes: a migração traz no cabeçalho o SQL de contagem para rodar antes. Se houver linhas, não são migradas para turnos (não há turno de origem) e as tabelas ficam até uma limpeza manual; o código novo não as usa.
- Remove os campos de turno do `CashRegister` só se as tabelas antigas estiverem vazias; caso contrário, os campos ficam sem uso.

## 5. Regras

1. **Um turno aberto por caixa**, pelo índice parcial. Abertura concorrente: a segunda recebe `409` com o turno aberto existente.
2. **Venda paga na hora exige turno aberto** no caixa informado pelo aparelho. Sem turno: `409 CASH_SESSION_REQUIRED` ("Abra o caixa para receber"); a comanda continua aberta.
3. **Pagamentos cobrem o total:** a soma dos pagamentos ≥ total da venda (calculado no servidor por `lib/comanda/line-total.ts`). O excedente só é aceito se houver pagamento em dinheiro e vira **troco** (`CHANGE`, `CASH`). Cartão, PIX ou outros acima do total: `400`.
4. **Esperado por forma**, em centavos:
   - dinheiro = troco inicial + `RECEIPT` + `SUPPLY` − `WITHDRAWAL` − `EXPENSE` − `CHANGE` − `REFUND` ± `ADJUSTMENT` (todos em `CASH`);
   - demais formas = `RECEIPT` − `REFUND` ± `ADJUSTMENT` daquela forma.
   - `ADJUSTMENT` soma quando `direction = IN` e subtrai quando `OUT`.
5. **Fechamento às cegas:** a rota de turno atual não devolve o esperado de dinheiro para `CASHIER`; devolve para `MANAGER`/`OWNER`/`ADMIN`. O fechamento recebe o contado, calcula esperado e diferença na mesma transação e só então os devolve.
6. **Alerta de diferença:** se, em qualquer forma, `|diferença| > max(2000 centavos, 2% do esperado)`, cria uma notificação `HIGH` para o restaurante (deduplicada por turno). Limites em constantes de `lib/caixa/rules.ts`.
7. **Turno fechado não muda.** Correções: lançamento `ADJUSTMENT` por gerente/dono no **turno fechado**, com motivo obrigatório, recalculando `expectedCents`/`differenceCents` e registrando auditoria. Não há reabertura de turno.
8. **Offline:** o aparelho envia o `cashSessionId` em que vendeu. Se o turno estiver fechado quando a venda chegar, os lançamentos entram nele com `afterClose = true`, `lateEntries` é incrementado, esperado e diferença são recalculados e o gerente recebe alerta. Se o `cashSessionId` não existir ou for de outro restaurante: `409 CASH_SESSION_REQUIRED`.
9. **Permissões** (via `requireRestaurantRole`):
   - abrir, fechar, sangria, suprimento, receber: `OWNER`, `MANAGER`, `CASHIER`, `ADMIN`;
   - despesa, ajuste, sangria acima do esperado, criar/renomear/desativar caixa, histórico completo: `OWNER`, `MANAGER`, `ADMIN`.
10. **Pedidos online** (Mercado Pago aprovado) não geram lançamentos. O resumo do turno mostra, só como informação, o total aprovado online entre `openedAt` e agora/`closedAt` (via `lib/payments/receipts-summary.ts`).
11. **Sangria acima do dinheiro esperado:** recusada para `CASHIER`; gerente pode confirmar com `force: true` e motivo (auditoria).
12. **Troco acima do dinheiro esperado:** permitido, com aviso na resposta.
13. **Valores:** inteiros em centavos > 0; entradas da UI em reais com no máximo 2 casas. Zero, negativo ou mais casas: `400`.
14. **Caixa desativado** não pode ter turno aberto (desativar com turno aberto: `409`).
15. **Turno esquecido:** a rotina `/api/kds/stale-check` (cron a cada 2 min já agendado) ganha a verificação de turnos `OPEN` há mais de **16 h**, com uma notificação deduplicada por turno. Alternativa equivalente se ficar mais limpa: uma rota própria chamada pelo mesmo script de cron.
16. **Auditoria** (`recordAudit`): abrir, fechar, ajuste, despesa, sangria forçada, estorno ao reabrir comanda.

## 6. Fluxo das vendas

### 6.1 Fechar comanda — `PUT /api/comanda/sessions/[id]` com `status: CLOSED`

Corpo novo: `{ status: 'CLOSED', cashSessionId, payments: [{ method, amount }], cashReceived?, customerCPF? }`.

Numa transação única:
1. Comanda do restaurante e `OPEN` (como hoje).
2. Turno do restaurante; `OPEN` ou regra 8.
3. Total pelo servidor; pagamentos cobrem o total; troco = excedente em dinheiro.
4. Fecha a comanda; grava um `RECEIPT` por forma (valores somados por forma) e um `CHANGE` se houver troco; `orderSessionId` em todos.

Depois da transação: NFC-e como hoje (`lib/nfe/emit-session.ts`), com `paymentMethod` = forma de maior valor; erro fiscal nunca desfaz a venda. A rota segue envolvida por `idempotent()`: um reenvio com a mesma `Idempotency-Key` devolve a resposta original sem gravar de novo.

**Compatibilidade:** o corpo antigo (`paymentMethod` único, sem `payments`/`cashSessionId`) continua aceito durante a transição, como um pagamento único do total na forma informada, no turno aberto do **caixa padrão** do restaurante. Sem turno aberto:
- requisição online normal: `409 CASH_SESSION_REQUIRED`, como no formato novo;
- requisição reenviada pela fila offline (cabeçalho `Idempotency-Key` presente): a comanda fecha como antes e os lançamentos entram no turno mais recente do caixa padrão com `afterClose = true` (regra 8); se o restaurante nunca abriu um turno, a comanda fecha sem lançamentos e o gerente recebe o alerta "Venda recebida sem caixa".

Cada uso do formato antigo é registrado em log; a compatibilidade é removida quando não houver uso por 30 dias.

### 6.2 Venda rápida — `POST /api/comanda/quick-sale`

Mesmo contrato de pagamento (`cashSessionId`, `payments`, `cashReceived`), numa requisição só, como hoje. Mesma compatibilidade do formato antigo.

### 6.3 Reabrir comanda fechada (gerente, já existe)

Na mesma transação da reabertura: cada `RECEIPT` da comanda gera um `REFUND` na mesma forma, e cada `CHANGE` gera um `ADJUSTMENT` `CASH` `direction: IN` (o troco volta a contar na gaveta), no **turno aberto do aparelho** do gerente, com motivo "Reabertura da comanda X". Sem turno aberto: `409 CASH_SESSION_REQUIRED`. Ao fechar de novo, os novos pagamentos entram normalmente.

### 6.4 Cancelar venda paga em dinheiro

Gerente registra `REFUND` no turno aberto, com motivo e `orderSessionId`.

### 6.5 Fora deste subprojeto

Acerto com o entregador (delivery pago na entrega), divisão da conta por pessoa, TEF, emissão de NFC-e com vários meios de pagamento na Focus.

## 7. API

Todas escopadas por `getRestaurantMember`/`requireRestaurantRole`; outro restaurante = `404`. Escritas envolvidas por `idempotent()`.

| Rota | Papel | O que faz |
|---|---|---|
| `GET /api/caixa/registers` | todos | lista os caixas ativos e o turno aberto de cada um |
| `POST /api/caixa/registers` | gerente | cria caixa |
| `PATCH /api/caixa/registers/[id]` | gerente | renomeia, desativa (regra 14) |
| `POST /api/caixa/sessions` | caixa+ | abre turno `{ cashRegisterId, openingFloat }` |
| `GET /api/caixa/sessions/current?cashRegisterId=` | caixa+ | turno aberto, resumo por forma, lançamentos; esperado em dinheiro só para gerente+ (regra 5) |
| `POST /api/caixa/sessions/[id]/entries` | caixa+ / gerente | sangria, suprimento (caixa+); despesa, ajuste, sangria forçada (gerente) |
| `POST /api/caixa/sessions/[id]/close` | caixa+ | `{ counted: {dinheiro,pix,credito,debito,outros}, notes }` → esperado, diferença, alerta |
| `GET /api/caixa/sessions?from&to&cashRegisterId` | gerente | histórico |
| `GET /api/caixa/sessions/[id]` | gerente; caixa só o próprio turno aberto | detalhe |
| `GET /api/print/cash-entry/[id]` e `/api/print/cash-session/[id]` | caixa+ | dados do comprovante e do fechamento para as páginas de impressão |

Rotas removidas: `app/api/caixa/route.ts`, `app/api/caixa/[id]/route.ts`, `app/api/caixa/reconciliacao/route.ts`, `app/api/caixa/movimentos/route.ts` (substituída por `entries`). A fila offline (`lib/offline/outbox.ts`) passa a enfileirar `entries` no lugar de `movimentos`.

## 8. Telas

### 8.1 `/caixa`
- Aparelho sem caixa escolhido e restaurante com mais de um caixa: "Este aparelho usa: [▾]" (guardado em `localStorage`, com fallback para o caixa padrão).
- **Fechado:** cartão "Caixa X está fechado", campo Troco inicial, botão Abrir caixa.
- **Aberto:** cabeçalho (caixa, quem abriu, hora); botões Sangria · Suprimento · Despesa (gerente+) · Fechar caixa; resumo por forma (vendas, nº de vendas, ticket médio; esperado em dinheiro oculto para o operador; "recebido online" informativo); lista de lançamentos (hora, tipo, valor, forma, quem, venda de origem clicável).
- Sangria/Suprimento/Despesa: diálogo com valor, motivo (categoria na despesa), Confirmar → imprime comprovante 80 mm (`lib/print/print-frame.ts`, nova página `/imprimir/caixa/lancamento`), com "Imprimir de novo" se falhar.
- Turno aberto há mais de 16 h: aviso no topo para fechar.

### 8.2 Fechar caixa (diálogo de 3 passos)
1. Contagem às cegas: dinheiro (calculadora opcional de cédulas e moedas), PIX, crédito, débito, outros; orientação para conferir no relatório da maquininha.
2. Confirmação: "Depois de confirmar, os valores não podem ser alterados".
3. Resultado: esperado × contado × diferença por forma, com cor (verde = 0; amarelo ≤ limite; vermelho > limite), observação, Imprimir fechamento (`/imprimir/caixa/fechamento`).

### 8.3 Pagamento no fechamento de conta e no balcão
O diálogo "Fechar conta" da comanda e a venda de balcão (`CounterSale`) ganham: total em destaque; botões rápidos Dinheiro · PIX · Crédito · Débito; "Adicionar outra forma" mostrando o restante; dinheiro recebido → troco; CPF como hoje. Sem turno aberto: aviso "Abra o caixa para receber" com botão que abre o caixa no próprio diálogo. O componente de pagamento é um só (`components/caixa/payment-panel.tsx`), usado pelos dois.

### 8.4 `/caixa/historico` (gerente+)
Lista de turnos (caixa, data, quem abriu/fechou, total vendido, diferença com cor), filtros por período e caixa; detalhe com resumo, contagem, lançamentos, ajustes e Imprimir.

### 8.5 Menu e celular
Entrada **Caixa** no menu (grupo "Vender" quando o menu em grupos existir; até lá, na tela inicial e no menu do admin), e atalho na comanda e no balcão. Todas as telas funcionam no celular.

## 9. Erros e casos difíceis

Ver regras 1, 2, 3, 8, 11, 12, 13, 14 e 15. Além disso:
- Fechamento concorrente do mesmo turno: só o primeiro grava (update condicional `status = 'OPEN'`); o segundo recebe o resultado já gravado.
- Aparelho trocado ou `localStorage` limpo: pergunta o caixa de novo; turno continua no servidor.
- Falha de impressão nunca desfaz o lançamento.

## 10. Testes

**Unitários (sem banco), `lib/caixa/rules.ts`:** esperado por forma; troco; pagamentos cobrem o total; limite do alerta; contagem de cédulas; tradução das formas; centavos.

**Integração (banco de teste local), `__tests__/integration/caixa/*`:**
- abrir turno; abertura concorrente recusada;
- comanda com 2 formas e troco → lançamentos corretos; venda rápida idem;
- reenvio com a mesma chave não duplica;
- venda com caixa fechado recusada e comanda continua aberta;
- venda offline atrasada entra no turno fechado com `afterClose`, alerta e recálculo;
- sangria, suprimento, despesa por papel (caixa não lança despesa); sangria acima do esperado;
- fechamento às cegas: operador não recebe o esperado antes; diferença e alerta acima do limite;
- ajuste em turno fechado recalcula e audita;
- reabrir comanda estorna os recebimentos;
- isolamento entre restaurantes;
- formato antigo de pagamento continua funcionando conforme §6.1.

**Navegador (Playwright, `next dev` local com `.env.test`):** abrir caixa, venda de balcão com 2 formas, sangria com comprovante, fechar às cegas, histórico; desktop e celular.

## 11. Entrega

Três etapas publicáveis separadamente, cada uma com testes verdes, publicada na `main` e com Deploy pelo dono:
1. **Base:** migração, `lib/caixa/*`, rotas novas, remoção das antigas, testes.
2. **Telas:** `/caixa`, fechar às cegas, `/caixa/historico`, comprovantes.
3. **Vendas:** pagamento múltiplo com troco na comanda e no balcão, exigência de caixa aberto, estorno ao reabrir, compatibilidade do formato antigo.

O dono roda a migração em produção pelo console do Easypanel (`npx prisma migrate deploy`), depois da contagem do cabeçalho.
