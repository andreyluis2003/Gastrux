# Contas de consumo (energia, água, gás, telefone e outras) — Design

**Data:** 2026-10-16
**Status:** design aprovado em chat (2 partes), aguardando revisão deste documento
**Origem:** pedido do dono (controlar luz, água e telefone com comparação mês a mês e KPIs). Reforçado pela primeira cliente espetaria, cuja maior reclamação da Vedas é a falta da parte financeira.

## 1. Problema

O restaurante paga energia, água, gás, telefone, aluguel e condomínio, mas o Gastrux não registra essas contas. A DRE não as inclui. Ninguém compara um mês com o anterior, e uma alta (vazamento, câmara fria com defeito, reajuste) só é percebida tarde. Em reais, uma alta pode ser só tarifa; só o consumo (kWh, m³) mostra gasto real.

## 2. Objetivo e critério de sucesso

Lançar cada conta em menos de 1 minuto, ver a DRE com as contas do mês e, no Pro, saber na hora se o consumo saiu do normal.

**Sucesso:**
- lançar uma conta: escolher a conta, o mês, o valor e o consumo → salvar;
- a DRE de um mês mostra a linha "Contas de consumo" com o total das contas daquele mês de referência;
- Pro: cada conta mostra a variação contra o mês anterior, a média de 3 meses e o mesmo mês do ano anterior, o preço por unidade e o % do faturamento; consumo 20% acima da média gera aviso no sino.

## 3. Decisões do dono (2026-10-16)

1. **Valor + consumo** para energia (kWh), água (m³), gás encanado (m³) e gás de botijão (quantidade de botijões); **só valor** para telefone/internet e "outras".
2. **Lista fixa + "Outra conta"** com nome livre (aluguel, condomínio, alarme…). Cada restaurante liga só as contas que tem.
3. **Entra na DRE pelo mês de referência**, numa linha nova "Contas de consumo" dentro de Despesas operacionais, mesmo que seja paga no mês seguinte.
4. **Planos:** lançar, histórico e DRE em **todos os planos**; comparações, preço por unidade, % do faturamento, gráfico e aviso no sino **do Pro para cima**.
5. **Aviso:** consumo (ou valor, nas contas sem consumo) **20% acima da média dos 3 meses anteriores com conta**, fixo na v1.
6. Contas a pagar (vencimento com aviso, situação "a pagar/paga") fica para uma segunda etapa.

## 4. Regras

### 4.1 Contas do restaurante
- Registro novo `UtilityAccount`: restaurante, `kind` (`ENERGY`, `WATER`, `PIPED_GAS`, `BOTTLED_GAS`, `PHONE_INTERNET`, `OTHER`), `name` (obrigatório em `OTHER`; nos demais, o nome padrão do tipo), `active`, `createdAt`.
- Unidade de consumo por tipo (fixa no código): ENERGY kWh, WATER m³, PIPED_GAS m³, BOTTLED_GAS botijões; PHONE_INTERNET e OTHER sem consumo.
- Gás de botijão: uma conta por tamanho (P13, P45), criadas como duas contas `BOTTLED_GAS` com nome "Gás P13" e "Gás P45" quando o dono escolher.
- Nome único por restaurante entre as contas ativas. Desativar esconde a conta do lançamento; histórico e DRE antigos não mudam.

### 4.2 Conta lançada
- Registro novo `UtilityBill`: conta, restaurante, `referenceMonth` (primeiro dia do mês, data sem hora), `amountCents` (> 0), `consumption` (decimal > 0, obrigatório nas contas com consumo, ausente nas sem), `dueDate?`, `notes?`, `createdById`, `updatedById?`, datas.
- **Única por conta e mês** (`@@unique([accountId, referenceMonth])`). Lançar de novo a mesma conta e mês **corrige** a existente (upsert), com `recordAudit` registrando o valor anterior.
- Mês de referência padrão na tela: o mês anterior ao atual (horário de Brasília). Não aceita mês futuro.
- Quem lança, corrige, cria e desativa contas: **dono e gerente** (`MANAGER_ROLES`). Leitura: os mesmos.

### 4.3 Indicadores (Pro)
Para a conta C no mês M (a medida é o consumo nas contas com consumo, o valor nas demais):
- **vs mês anterior:** variação % da medida e do valor entre M e M−1 (só se houver conta em M−1).
- **vs média de 3 meses:** média da medida nas contas existentes entre M−3 e M−1; precisa de pelo menos 2 meses com conta, senão "sem base ainda".
- **vs mesmo mês do ano anterior:** M−12, quando existir.
- **Preço por unidade:** valor ÷ consumo, com o de M−1 ao lado ("era R$ 0,85").
- **% do faturamento:** valor ÷ vendas do mês M (4.5).
- Mês sem conta entre os comparados aparece como "sem conta lançada" e é ignorado nas médias.

### 4.4 Aviso no sino (Pro)
- Avaliado ao lançar ou corrigir uma conta, para o mês de referência dela (uma conta de setembro lançada em novembro compara com junho a agosto).
- Dispara quando a medida de M > 1,20 × média de 3 meses (com base válida).
- Um aviso por conta e mês (`dedupeKey` `utility:<accountId>:<YYYY-MM>`), restaurant-wide (dono e gerente veem), `actionUrl` para a tela da conta.
- Texto: "Energia de setembro: consumo 24% acima da média (1.380 kWh). Confira vazamento ou equipamento ligado." Nas contas sem consumo: "Telefone/Internet de setembro: valor 30% acima da média (R$ 320,00)."

### 4.5 Vendas do mês (base do % do faturamento)
Mesmo critério do Caixa: entradas de venda do caixa com comanda (`salesSummary` de `lib/caixa/rules.ts`), mais pagamentos online aprovados de comandas (pagamento na mesa), mais pedidos do delivery do site sem comanda e não cancelados. Tudo com data no mês M (horário de Brasília). A função fica em `lib/finance/month-sales.ts` para ser reaproveitada na correção da Receita bruta da DRE (backlog).

### 4.6 DRE
- `app/api/financeiro/dre/route.ts` soma em `despesasOperacionais.contasConsumo` as contas cujo `referenceMonth` cai entre o mês de `startDate` e o mês de `endDate`, inclusive, e inclui o valor em `despesasTotais`.
- A tela da DRE mostra a linha "Contas de consumo" em Despesas operacionais. Quando o período não começa no dia 1 ou não termina no último dia do mês, mostra a nota "Contas de consumo entram pelo mês inteiro".

## 5. Telas e rotas

- **Menu:** Relatórios › "Contas de consumo" (`/financeiro/contas`), dono e gerente.
- **Primeiro uso:** marcar as contas que o restaurante tem (lista fixa) e criar "Outras".
- **Tela principal:** um cartão por conta ativa com o último mês lançado e, no Pro, os indicadores de 4.3; botão "Lançar conta"; histórico de 12 meses por conta (lista em todos os planos; gráfico de valor e consumo no Pro). No Starter, os indicadores aparecem bloqueados com o link para os planos.
- **Lançar conta:** conta, mês de referência (padrão o mês anterior), valor, consumo (quando houver, com a unidade), vencimento e observação opcionais. Se já existir conta daquele mês, o formulário abre preenchido e o botão diz "Corrigir".
- **Rotas** (todas com `requireRestaurantRole(MANAGER_ROLES)` e escopo do restaurante):
  - `GET /api/utility-bills` — contas, últimos 13 meses de lançamentos e, no Pro, indicadores;
  - `POST /api/utility-bills/accounts` — criar conta; `PATCH /api/utility-bills/accounts/[id]` — renomear (OTHER) ou ativar/desativar;
  - `PUT /api/utility-bills` — lançar ou corrigir `{ accountId, referenceMonth: 'YYYY-MM', amount, consumption?, dueDate?, notes? }`.

## 6. Código

- `lib/utility-bills/rules.ts` — puro: unidade por tipo, validação, mês de referência, variações, média com meses vazios, preço por unidade, regra dos 20%, textos do aviso.
- `lib/utility-bills/service.ts` — contas, upsert com auditoria, carga da tela.
- `lib/utility-bills/alert.ts` — aviso Pro com dedupe.
- `lib/finance/month-sales.ts` — vendas do mês (4.5).
- `tier-guard`: feature `utilityInsights: ['pro', 'business', 'enterprise']`.

## 7. Banco

Migração só com coisas novas: enum `UtilityKind`, tabelas `utility_accounts` e `utility_bills`, índice único `(accountId, referenceMonth)`, índice `(restaurantId, referenceMonth)`. **No Deploy: rodar `npx prisma migrate deploy`** (homolog e app).

## 8. Testes

- **Unidade** (`rules.ts`): variações; média ignorando meses vazios; menos de 2 meses → sem base; exatamente 20% não dispara, 20,1% dispara; preço por unidade; conta sem consumo usa o valor; validação (valor ≤ 0, consumo ausente onde é obrigatório, mês futuro).
- **Banco de testes:** lançar e corrigir (uma por mês, auditoria); permissões (caixa e cozinha recebem 403); isolamento entre restaurantes; conta desativada sai do lançamento mas fica no histórico; DRE soma pelo mês de referência (conta lançada em novembro para setembro entra na DRE de setembro); aviso só no Pro, uma vez por conta e mês, comparando com os meses anteriores ao de referência; Starter recebe a lista sem indicadores; vendas do mês (caixa + online + delivery do site, sem contar comanda cancelada).
- **Navegador (homologação, celular e tablet):** primeiro uso, lançar 4 meses de energia, ver indicadores e aviso, corrigir um mês, DRE com a linha nova.

## 9. Fora do escopo (v1)

Contas a pagar (vencimento com aviso e situação paga); leitura da conta por foto/IA; integração com concessionárias; percentual de aviso ajustável; rateio de conta por período parcial; correção da Receita bruta da DRE (backlog, logo em seguida).
