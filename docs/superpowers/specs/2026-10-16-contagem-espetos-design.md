# Contagem de espetos (contagem do dia) — Design

**Data:** 2026-10-16
**Status:** design aprovado em chat (2 partes), aguardando revisão deste documento
**Origem:** primeira cliente espetaria (sai da Vedas Sistemas). Reclamação dela: conta tudo na mão e não sabe quantos espetos de frango, kafta ou carne saíram. A Vedas não tem isso: é diferencial na demonstração.

## 1. Problema

A espetaria monta os espetos antes de vender, guarda a sobra na geladeira e vende no dia seguinte. Hoje ninguém sabe, por tipo, quantos foram montados, vendidos, perdidos e quantos deveriam sobrar. Espeto que sai sem ser lançado (ou se perde sem registro) passa despercebido.

## 2. Objetivo e critério de sucesso

Em cada noite, por tipo de espeto: **início + montados − vendidos − perdas = deveria ter**; no fechamento, a contagem real mostra a **diferença**.

**Sucesso:**
- lançar montados ou perda leva 1 a 2 toques no celular ou tablet da churrasqueira;
- os vendidos aparecem sozinhos, sem ninguém digitar;
- no fechamento, o dono vê em vermelho cada tipo com espeto faltando, e o valor em R$ pelo custo da ficha técnica;
- a sobra contada vira o início da noite seguinte.

## 3. Decisões do dono (2026-10-16)

1. A sobra **volta para a geladeira** e é vendida no dia seguinte (vira o início da próxima noite).
2. **Só contagem**; validade fica com as etiquetas que já existem (`FoodLabel`, alerta das 7h, Pro). O descarte é lançado como perda na contagem.
3. **Todos os planos**, inclusive Starter. Aviso no sino da diferença: do Pro para cima.
4. Construção: **contagem por noite, de fechamento a fechamento**, registro próprio; o estoque de insumos não muda (continua dando baixa nas vendas como hoje).

## 4. Regras

### 4.1 Quais itens entram
- `Recipe` ganha `dailyCount Boolean @default(false)` ("Contar na contagem do dia"), editável na ficha técnica por dono e gerente.
- O modelo de cadastro "Espetaria" (`lib/onboarding/starter-templates.ts`) marca os itens do grupo **Espetos** (7 espetos e o pão de alho): `TemplateRecipe` ganha `dailyCount?: boolean` e o seed grava.
- Nome na tela: **"Contagem de espetos"** quando o tipo de negócio é espetaria; **"Contagem do dia"** nos demais (salgados, pão de queijo, marmitas).

### 4.2 Noite (período)
- Registro novo `DailyCount`: restaurante, `openedAt`, `closedAt?`, `closedById?`, `status` (`OPEN`, `CLOSED`).
- **No máximo uma noite aberta por restaurante** (índice único parcial em `restaurantId` onde `status = 'OPEN'`).
- A primeira noite abre no primeiro lançamento. Ao fechar uma noite, a seguinte abre na mesma transação, com `openedAt = closedAt` da anterior.

### 4.3 Lançamentos
Registro novo `DailyCountEntry`: noite, `recipeId`, `kind` (`OPENING`, `MOUNTED`, `LOSS`), `quantity` (inteiro > 0), `reason?` (perda: caiu, queimou, venceu, outro + texto), `userId`, `createdAt`.
- **Início:** na primeira noite do restaurante, a tela pergunta "quantos você já tem de cada?" e grava `OPENING`. Nas seguintes, o início é a contagem do fechamento anterior (não há `OPENING` manual).
- **Montados:** "+" (1) ou atalhos +10/+20 ou valor digitado, a qualquer hora; repor no meio da noite é outro lançamento.
- **Perda:** quantidade + motivo.
- **Desfazer:** o autor apaga o próprio lançamento em até 2 minutos (toque errado); depois disso, só dono e gerente, com auditoria.
- Quem lança: dono, gerente, caixa e cozinha (`COOK`).

### 4.4 Vendidos
- Vendidos de um tipo numa noite = soma de `OrderItem.quantity` com aquele `recipeId`, de pedidos do restaurante, `OrderItem.status ≠ CANCELLED` e `Order.status ≠ CANCELLED`, com `OrderItem.createdAt` em `[openedAt, closedAt)` (noite aberta: até agora).
- Cobre tudo o que passa pela cozinha: comanda (envio), venda de balcão (`quick-sale` envia), QR, WhatsApp e delivery do site. Item removido da comanda com motivo já é cancelado na cozinha (`lib/kds/withdraw-line.ts`).
- Venda feita sem internet e enviada depois do fechamento entra na noite em que chegou.

### 4.5 Fechamento
- Só **dono e gerente** (`MANAGER_ROLES`). A tela mostra, por tipo, início, montados, vendidos, perdas e **deveria ter**; a pessoa digita o **contado** de cada tipo (obrigatório para todos os tipos da noite).
- Tipos da noite = receitas com `dailyCount = true` agora **mais** as que têm lançamento na noite (item desmarcado no meio da noite fica até o fechamento) **mais** as que tinham sobra contada no fechamento anterior.
- Registro novo `DailyCountLine` por tipo, **congelado**: `opening`, `mounted`, `sold`, `loss`, `expected`, `counted`, `difference = counted − expected`, `unitCost` (custo da porção da ficha técnica no fechamento), nome da receita no fechamento.
- Transação com trava na noite (`SELECT … FOR UPDATE`): fecha, grava as linhas e abre a próxima. Lançamento que chega durante ou depois do fechamento vai para a noite nova. Dois fechamentos simultâneos: o segundo recebe 409.
- Depois de fechada, nada muda o retrato (venda cancelada depois não altera; a noite seguinte parte do contado real, então o erro não se propaga).
- **Diferença ≠ 0:** fica em vermelho (falta) ou amarelo (sobrou mais do que devia). **Pro+:** uma notificação no sino para dono e gerente: "Contagem de 15/10: faltam 4 espetos de frango e 2 de kafta (R$ 18,40)".

### 4.6 Avisos na tela
- Noite aberta há mais de 20 h: "Contagem aberta desde ontem, 18h. Feche para conferir." O fechamento cobre todo o período, sem perder nada.
- Texto fixo: "Pedidos do iFood e do Keeta só entram na contagem se forem lançados no Gastrux (venda de balcão)."

### 4.7 Relatório
- Lista de noites fechadas (mais recente primeiro) com totais: vendidos, perdas, diferença em unidades e em R$.
- Por semana (últimas 4): vendidos por tipo (o que mais sai), perdas e diferenças por tipo.

## 5. Telas e rotas

- **Tela** `/contagem` (no menu de Operação; celular e tablet primeiro): linhas por tipo com Início · Montados · Vendidos · Perda · Deveria ter; botões "+", "+10", "Perda"; botão "Fechar contagem" (dono e gerente) que abre o formulário do contado; aba "Histórico" com o relatório.
- **Rotas** (todas com `requireRestaurantRole` e escopo do restaurante):
  - `GET /api/daily-count` — noite aberta com as linhas calculadas (vendidos ao vivo).
  - `POST /api/daily-count/entries` — `{ recipeId, kind, quantity, reason? }`.
  - `DELETE /api/daily-count/entries/[id]` — regra de 4.3.
  - `POST /api/daily-count/close` — `{ counts: [{ recipeId, counted }] }`.
  - `GET /api/daily-count/history?weeks=4`.
- **Ficha técnica:** caixa "Contar na contagem do dia".

## 6. Código

- `lib/daily-count/compute.ts` — função pura: entradas (início, lançamentos, vendidos) → linhas com `expected` e `difference`.
- `lib/daily-count/sold.ts` — consulta dos vendidos por receita no intervalo.
- `lib/daily-count/close.ts` — transação do fechamento (trava, linhas, próxima noite, aviso Pro).
- Plano: `tier-guard` ganha `dailyCountAlert: ['pro', 'business', 'enterprise']`; a contagem em si não tem trava de plano.

## 7. Banco

Migração só com coisas novas: coluna `recipes.dailyCount`, tabelas `daily_counts`, `daily_count_entries`, `daily_count_lines`, enums, índice único parcial. **No Deploy: rodar `npx prisma migrate deploy`** (homolog e app).

## 8. Testes

- **Unidade** (`compute.ts`): conta e diferença; sem lançamentos; só início; perda maior que o esperado (deveria ter negativo aparece, não é cortado).
- **Banco de testes:** vendidos contam item e pedido não cancelados no intervalo e ignoram cancelados; noite que passa da meia-noite; lançar e desfazer (autor em 2 min, gerente depois); permissões (cozinha lança mas não fecha); fechamento congela, abre a próxima com início = contado; lançamento durante o fechamento vai para a noite nova; dois fechamentos simultâneos → um 409; item desmarcado no meio da noite fica até fechar; aviso no sino só no Pro; modelo Espetaria marca os espetos; isolamento entre restaurantes.
- **Navegador (homologação):** comanda com espetos enviada → vendidos sobem; montados e perda; fechamento com diferença em vermelho; histórico.

## 9. Fora do escopo (v1)

Validade por lote (fica com as etiquetas); baixa de insumo na montagem; integração iFood/Keeta; combos e adicionais contando espeto; contagem por estação/churrasqueira separada.
