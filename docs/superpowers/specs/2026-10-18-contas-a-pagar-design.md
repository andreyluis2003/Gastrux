# Contas a pagar — Design

**Data:** 2026-10-18
**Status:** design aprovado em chat (escopo + 2 partes), aguardando revisão deste documento
**Origem:** segunda etapa das contas de consumo (spec 2026-10-16, decisão 6) e a maior reclamação da primeira cliente espetaria sobre a Vedas: a falta da parte financeira.

## 1. Problema

O restaurante não tem onde ver o que precisa pagar, quando vence e o que já pagou. As contas de consumo já guardam um vencimento, mas nada o usa. Boletos de fornecedor chegam no XML da nota de compra e são ignorados. Conta atrasada gera multa; conta paga duas vezes é dinheiro perdido.

## 2. Objetivo e critério de sucesso

O dono abre uma tela e vê o que está atrasado, o que vence hoje e nos próximos 7 dias, marca como paga com a forma e a origem do dinheiro, e a DRE mostra o custo de cada mês sem contar nada duas vezes.

**Sucesso:**
- cadastrar uma conta avulsa, uma parcelada (2 a 24) ou uma que se repete todo mês;
- marcar como paga (com a gaveta do caixa ou o banco) e desfazer o pagamento com motivo;
- conta de consumo com vencimento aparece sozinha; boletos da nota de compra viram contas;
- Business: resumo diário no sino e no e-mail às 07h; repetição automática; contas da nota de compra;
- a DRE de um mês soma as contas pela competência, sem duplicar contas de consumo, compras de mercadoria (já no CMV), saídas da gaveta ou salários.

## 3. Decisões do dono (2026-10-18)

1. **Todas as contas numa lista só** (fornecedores, aluguel, impostos, salários, parcelas, contas de consumo).
2. **DRE pela competência** (mês da conta), paga ou não.
3. **Repetição mensal automática e parcelas geradas de uma vez.**
4. **A importação da nota de compra cria as contas** dos boletos (duplicatas) do XML.
5. **Planos:** lista, cadastro, parcelas, marcar como paga e desfazer em todos os planos; **repetição automática, avisos e contas criadas pela nota de compra no Business** (e no teste de 30 dias).
6. Abordagem A: cadastro novo de contas a pagar (não o fluxo de caixa antigo nem as contas de consumo esticadas).
7. Compras de mercadoria não entram como despesa na DRE (o custo já está no CMV das fichas).

## 4. Dados (migração `20261018150000_payables`)

```prisma
enum PayableCategory { MERCHANDISE RENT UTILITIES PAYROLL TAXES SERVICES LOANS OTHER }
enum PayableStatus { OPEN PAID CANCELED }
enum PayableSource { MANUAL SERIES INSTALLMENT UTILITY NFE }

model PayableSeries {           // "repete todo mês"
  id, restaurantId, description, category, supplierId?, amountCents Int, dueDay Int (1..31),
  active Boolean @default(true), createdById, createdAt, updatedAt
}

model Payable {
  id, restaurantId, description (1..120), category PayableCategory, supplierId? (Supplier),
  amountCents Int (> 0), competenceMonth DateTime @db.Date (dia 1), dueDate DateTime @db.Date,
  status PayableStatus @default(OPEN), notes String?,
  source PayableSource @default(MANUAL),
  seriesId? (PayableSeries), installmentGroup String?, installmentNumber Int?, installmentTotal Int?,
  utilityBillId String? @unique (UtilityBill, onDelete: SetNull),
  nfeKey String?, nfeDupNumber String?          // @@unique([restaurantId, nfeKey, nfeDupNumber])
  paidAt DateTime?, paidMethod String?, paidFrom String? ('DRAWER'|'BANK'), cashEntryId String? @unique,
  paidById?, canceledAt?, canceledById?, cancelReason?, createdById, updatedById?, createdAt, updatedAt
  @@unique([seriesId, competenceMonth])  @@index([restaurantId, status, dueDate])  @@index([restaurantId, competenceMonth])
}
```
`CashSessionEntry.payableId String?` (a saída da gaveta que pagou uma conta).

## 5. Regras

- **Situação na tela** (calculada, Brasília): `PAID`/`CANCELED` como gravado; `OPEN` vira **atrasada** (dueDate < hoje), **vence hoje**, **próximos 7 dias** ou **a vencer**.
- **Competência** padrão = mês do vencimento; o dono pode mudar (aluguel de outubro pago em 05/11).
- **Parcelar:** total + n (2..24) + 1º vencimento → n contas mensais (mesmo dia; dia inexistente vira o último do mês), `"<descrição> k/n"`, centavos na última, mesmo `installmentGroup`, competência = mês de cada vencimento.
- **Repetir (Business):** `PayableSeries`; o sistema mantém criadas as contas da série do mês atual e dos 2 seguintes (rotina diária e ao abrir a tela), `@@unique([seriesId, competenceMonth])` impede duplicar. Editar uma conta da série: **só esta** (muda a conta) ou **esta e as próximas** (muda a série e as contas `OPEN` futuras). Parar de repetir: `active=false`, contas existentes ficam. Restaurante que sai do Business: a série para de gerar (as existentes ficam).
- **Contas de consumo:** salvar uma conta de consumo **com vencimento** cria ou atualiza a conta a pagar ligada (`utilityBillId`, categoria UTILITIES, mesmo valor, competência = mês de referência). Sem vencimento: nenhuma. A conta a pagar de consumo não muda valor pela tela de contas a pagar (edita-se na tela de Contas de consumo); só se paga/cancela.
- **Nota de compra (Business):** o parser da importação lê `<cobr><dup><nDup><dVenc><vDup>` e a chave da nota (`Id` de `infNFe`, 44 dígitos). A resposta mostra as duplicatas; com "Lançar no Contas a pagar" (padrão ligado) cria uma conta por duplicata (MERCHANDISE, fornecedor pelo CNPJ do emitente quando cadastrado, `"NF <nNF> - <emitente> <nDup>"`). Repetir a importação não duplica (`@@unique` por chave + nDup).
- **Marcar como paga:** data (padrão hoje), forma (Dinheiro, PIX, Boleto, Cartão, Débito automático, Outro), origem **Gaveta do caixa** (exige caixa aberto: cria `CashSessionEntry` EXPENSE em dinheiro com `payableId`, mesma regra de "dinheiro insuficiente" do caixa) ou **Banco** (nada no caixa). Conta já paga: 409.
- **Desfazer pagamento** (dono/gerente, motivo): volta a `OPEN`; se saiu da gaveta, lança no turno aberto um ajuste de entrada do mesmo valor (ou recusa sem caixa aberto, com mensagem). Auditado.
- **Cancelar** (motivo): `CANCELED`, some dos totais; conta paga não se cancela (desfaça antes).
- **DRE (competência):** soma `Payable` não cancelados com `competenceMonth` no período, por categoria: RENT, TAXES, SERVICES, LOANS, OTHER → Despesas operacionais (nova sublinha "Contas a pagar"); PAYROLL → Pessoal: **se o mês tem contas PAYROLL, a DRE usa a soma delas no lugar da estimativa pelos salários da Equipe**; UTILITIES e MERCHANDISE → **não somam** (consumo já entra pela tela de Contas de consumo; mercadoria já está no CMV). As saídas da gaveta com `payableId` **saem** da soma de despesas do caixa (já contadas pela conta).
- **Acesso:** dono, gerente e ADMIN (`requireRestaurantRole(MANAGER_ROLES)`); caixa e cozinha 403. Toda gravação passa pela trava de plano (middleware, spec 2026-10-18 planos).

## 6. Avisos (Business)

Rotina diária `POST /api/payables/morning-check` (CRON_SECRET, crontab 10:00 UTC = 07h BRT, junto da das etiquetas): para cada restaurante com `isTierFeatureEnabled(tier, 'payableAlerts')` e contas `OPEN` atrasadas, vencendo hoje ou em 3 dias, **um** aviso no sino do dia (restaurante, dono/gerente): título "Contas a pagar: 2 vencem hoje (R$ 1.450,00) · 1 atrasada (R$ 300,00) · 1 em 3 dias", link `/contas-a-pagar`; deduplicação por restaurante e dia. E-mail ao dono com a mesma lista (Resend), falha só registrada. Também gera as contas das séries (seção 5).

## 7. Planos

Novos recursos em `lib/tier-guard.ts`: `payableSeries`, `payableAlerts`, `payableFromNfe` → `['business', 'enterprise']`. No Pro, "Repetir todo mês" e a opção da nota de compra aparecem desabilitados com o selo **Business** e o texto do que ganharia. Página de preços e `pricing-tiers` (feature do Business): "Contas a pagar com avisos e repetição automática"; Pro: "Contas a pagar".

## 8. Tela

`/contas-a-pagar`, menu **Caixa e pagamentos › Contas a pagar** (MANAGERS).
- Quatro quadros: **Atrasadas**, **Vencem hoje**, **Próximos 7 dias**, **Total do mês** (valor e quantidade; o do mês = competência do mês atual, não canceladas).
- Lista ordenada por vencimento, com situação colorida, filtros (situação, categoria, mês de competência) e ações por linha: **Marcar como paga**, **Editar**, **Desfazer pagamento**, **Cancelar**.
- **Nova conta:** descrição, categoria, fornecedor (lista dos cadastrados, opcional), valor, vencimento, competência (padrão mês do vencimento), anotação; alternador **Uma vez / Parcelar / Repetir todo mês**.
- Valores em pt-BR (`1.240,50` aceito), datas dd/mm/aaaa, funciona em 390 px.
- Importação da nota (`/admin/nfe-import`): bloco "Boletos desta nota" com as duplicatas e a caixa "Lançar no Contas a pagar".

## 9. Textos e conhecimento

Artigo da Central de ajuda "Como uso o Contas a pagar?" (categoria Vendas e caixa ou nova "Financeiro"); `lib/ai/knowledge/contas-pagar.ts` + ferramenta de leitura `contas_a_pagar` (dono e gerente: atrasadas, próximas, total do mês); manual (Funcionalidades + crontab).

## 10. Fora do escopo

Contas a receber, conciliação bancária, pagamento de boleto pelo Gastrux, leitura de código de barras do boleto, **anexar a foto ou o PDF do boleto** (o Gastrux ainda não tem armazenamento de arquivos configurado em produção; a anotação guarda a linha digitável se o dono quiser), rateio entre lojas.

## 11. Testes

- **Unidade:** situação calculada (atrasada/hoje/7 dias/a vencer, fuso de Brasília); parcelas (centavos na última, dia 31 em fevereiro); próximas competências da série; mapa categoria → linha da DRE; parser das duplicatas do XML (0, 1 e 3 `<dup>`).
- **Integração:** criar/editar/cancelar/pagar/desfazer (com gaveta: entrada no turno e volta; sem caixa aberto: 409); série gera 3 meses e não duplica, "esta e as próximas"; conta de consumo com vencimento cria/atualiza a ligada, sem vencimento não; importação de nota com duplicatas cria contas e reimportar não duplica, no Pro não cria; DRE do mês: aluguel + imposto somam, mercadoria e consumo não somam em dobro, PAYROLL substitui a estimativa, saída da gaveta ligada não soma duas vezes; rotina de avisos uma vez por dia, só Business; caixa e cozinha 403; outro restaurante 404.
- **Homolog:** cadastrar aluguel repetido, parcelar uma compra, pagar pela gaveta e desfazer, importar um XML de compra a prazo, conferir DRE e sino.

## 12. Ordem de entrada no ar

Main com a migração → dono: Deploy `homolog` + migrate → minha verificação → dono: Deploy `app` + migrate + linha do crontab `0 10 * * * /root/gastrux-cron.sh /api/payables/morning-check`.
