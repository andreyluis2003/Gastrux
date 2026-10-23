# Pendências

Tudo o que uma revisão deixou para depois fica aqui, por extenso (o quê, onde, por quê), e sai daqui com o
commit que resolveu. Os registros em `.superpowers/sdd/` não vão para o git e se perdem: não servem para isso.

## Telas escondidas (decisão do dono, 2026-10-19)

Apagadas (cada endereço antigo redireciona): /tutorial → /ajuda, /estoque-rapido → /estoque/entrada,
/notas-fiscais → /admin/nfe-import, /custo-analise → /receitas, /alertas, /alertas-inteligentes e
/previsoes-demanda → /dashboard, /vendas-rapidas → /vender, /settings/pos e as telas de voz → /admin/settings.
Corrigida: /escalonamento (Escalonar receita, em Mais recursos).

### Abertos

- **Rotas da API sem tela**: ficaram de propósito, para uma limpeza separada (algumas têm testes ou outros
  usos). Conferir cada uma antes de apagar: `/api/stock/quick-movement` (citada em security-fixes.test.ts),
  `/api/invoices/process-ocr` (o resto de `/api/invoices` serve a tela de faturas em /conta/cobranca),
  `/api/cost-analysis/{ingredient-summary,ingredient-trends,supplier-comparison,recipe-costs,price-alerts}`
  (passam no teste de isolamento read-isolation), `/api/alerts`, `/api/smart-alerts/{rules,check}`,
  `/api/pos/{transactions,settings}` (o `/api/pos/webhook` é outra coisa), `/api/demand-forecast`,
  `/api/admin/voice/*` e `/api/voice/webhook/*` (testados no security-sweep do bad-day).
- **/admin/alertas-smart** ("Alertas Smart", só pelo endereço): não estava na auditoria; o dono não decidiu.
- ~~E-mail do 3º dia~~: apagado em 2026-10-19 com a sequência antiga (ver "E-mails de onboarding").

## Telas que não funcionam (achadas nos artigos da Central de Ajuda, 2026-10-20)

Nenhum artigo da /ajuda ensina estas telas (o teste `help-seed-articles.test.ts` impede citar Cashback,
Previsões e Relatório executivo). Todas estão no menu e esperam decisão do dono.

- **Fidelidade e Cashback** (Clientes e marketing): nenhuma venda gera pontos nem cashback. `POST /api/cashback`
  (credita o cashback e soma `Customer.totalSpent`) não é chamado por nenhuma tela nem pelo fechamento de conta;
  os pontos só entram por `/api/indicacao`. Os "marcos" de `/dashboard/loyalty/milestones` são gravados e nunca
  aplicados a pedido nenhum. `/dashboard/loyalty` não tem botão para criar programa (o programa padrão só nasce em
  `lib/loyalty/get-program.ts`, chamado pelo cashback e pela indicação). O site (why-gastrux.tsx e /pricing) vende
  "Campanhas e programa de fidelidade" no Business.
- **Clientes (CRM)**: "Total gasto", "Total de pedidos", ticket médio e segmento (VIP/Regular/Ocasional) nunca são
  atualizados pelas vendas (só o `POST /api/cashback`, que ninguém chama, soma `totalSpent`). Cliente só entra
  cadastrado à mão ou pelo site de delivery com e-mail. As anotações (Interações, Pro) funcionam.
- **Campanhas**: exigem um provedor de WhatsApp configurado (Meta, Take Blip ou Zenvia) e template aprovado; a lista
  de destinatários é digitada (telefone|nome|1=valor) e as variáveis são JSON. Não testado de ponta a ponta.
- **Relatórios > Financeiro** (`/dashboard/financeiro`): o "Resumo de Hoje" e os métodos de pagamento vêm de
  `Payment` (só pagamentos online), `CashFlowRecord` (lançamentos manuais do Fluxo de Caixa) e `Order`, não do
  critério do Caixa/DRE (`salesInRange`). **Previsões** (`/api/financial/calculate-forecast`): "Receita" é a média
  de um pagamento, "Pedidos" soma 1 por pedido e divide pelo número de pedidos (sempre 1), a média ponderada soma
  pesos sem dividir e a confiança é fixa (0,7/0,75/0,85). **Análises** (`/api/financial/metrics`) e **Fluxo de
  Caixa** não foram conferidos. Só o link para a DRE está certo.
- **Relatórios > Relatório executivo (PDF)**: `app/api/reports/executive/route.ts` gera o PDF em
  `apps.abacus.ai/api/createConvertHtmlToPdfRequest` com `ABACUSAI_API_KEY`. Sem a chave em produção, todo PDF
  falha. O CMV do PDF vem das movimentações de estoque, não da DRE.
- ~~**Comissões**~~ (resolvido 2026-10-23, "Editar remuneração" em Equipe e acessos): a regra só era escolhida ao
  adicionar a pessoa. O `PUT /api/admin/staff/[id]` checava o papel global e gravava cargo e status sem validar;
  agora só remuneração e horário (`lib/staff/pay.ts`), papel na loja, auditado.
- ~~**Planejamento de produção**~~ (resolvido 2026-10-23): a cozinha via botões que falhavam e os custos; as rotas
  checavam o papel global (um caixa mudava planos). Agora papel na loja, `canManage` e plano sem custo para a cozinha.
- ~~**Vendas e Lucratividade** (páginas)~~ (resolvido 2026-10-23): `useEffect` vinha depois de um `return`
  condicional, contra a regra dos hooks do React.

Corrigidos no mesmo dia: limite de lojas no teste grátis, números do painel e dos alertas de Várias lojas, quem vê
e copia fichas entre lojas, Lucratividade (base, último dia, planilha falsa) e o status em inglês na lista de planos.

## E-mails de onboarding (decisão do dono, opção A, 2026-10-19)

Sequência nova em `lib/onboarding/emails.ts` (Resend): boas-vindas, dia 1, dia 7, dia 14, só para o dono de
restaurante que não é conta interna, cada uma só nos 3 dias depois da data, com link "Parar as dicas"
(`users.onboardingEmailsOptOut`, migração 20261019120000_onboarding_email_optout). Rotina diária no crontab:
`0 13 * * * /root/gastrux-cron.sh /api/email/onboarding-sequence`. Saíram as rotas Abacus send-welcome, send-day3,
send-day7, send-onboarding, check-onboarding-emails e `lib/email-templates/onboarding-sequence.ts`.

### Abertos

- **Outros e-mails ainda pela Abacus.ai** (`sendNotificationEmail` em `lib/email-service.ts` ou fetch direto para
  apps.abacus.ai): os segmentados (`/api/email/check-segmented-emails`, send-new-user, send-inactive,
  send-early-adopter), `/api/admin/batch-email-send`, lembrete de reserva (`/api/email/send-reminder`),
  `lib/admin-alerts.ts` e `lib/pdf-generator.ts`. Sem `NOTIF_ID_*` em produção eles não saem. Rever texto e
  passar para Resend (`sendTransactionalEmail`) ou apagar, um por um.
- Os campos antigos da sequência em `users` (emailSentDay3/Day21/TrialEnding, emailVariant*, emailDay*OpenedAt)
  ficaram sem uso; apagar numa migração futura, junto com os que a tela de funil (`/api/analytics/conversion-funnel`) lê.

## Planos novos (2026-10-18), revisão de 2026-10-19

O registro original se perdeu; M-1, M-2, M-4 e M-5 foram recuperados do histórico da sessão de 2026-10-18.

### Abertos

Nenhum.

### Resolvidos

- **M-1. Plataforma deixava um plano pago "em teste"**: o formulário manda sempre os três campos; escolher
  Pro num cliente em teste deixava 'trialing' e travava na data do teste. Agora escolher outro plano pago
  grava 'active' (o teste se estende em "Estender teste"); a opção "cancelled" virou "canceled".
  `app/api/admin/customers/[id]/route.ts`.
- **M-2. "Estender teste" depois de um cancelamento era desfeito**: a cópia de "sem plano" para as lojas
  pula a loja com teste estendido pela Plataforma (data diferente da do teste do gateway; cancelar durante o
  teste do gateway continua encerrando na hora). `storesToMirror` em `lib/billing/subscription-sync.ts`.
- **M-5. Trava até 5 minutos depois de pagar**: no Stripe, a tela de sucesso agora espera a assinatura
  gravada pelo webhook (como no Mercado Pago) e relê o login de novo 4 s depois. `app/billing/success/page.tsx`.
  Sem teste automatizado: conferir na próxima assinatura real pelo Stripe.

- **Assinou durante o teste continuava "em teste"**: faixa "faltam N dias / Escolher plano", trava se o
  gateway avisasse a 1ª cobrança com atraso, e "Estender teste" trocava o Pro por teste do Business.
  `lib/billing/plan-access.ts` (subscribedInTrial). Commit 9e19c5a.
- **Loja nova nascia travada**: `app/api/admin/multi-location/route.ts` criava a 2ª loja com
  `subscriptionTier: 'starter'`, que desde 18/10 significa "sem plano". Agora copia o plano da loja atual. 8aa09fd.
- **Beta testers**: a loja nascia como Starter e "Estender acesso" mudava só o usuário, então a loja
  travava na data antiga. `setOwnerTrialEnd` em `lib/admin/trial.ts`, usado na criação e no "Estender". 8aa09fd.
- **Contas internas (e M-4)**: conta interna sem plano lia "sem plano" (IA 0, 1 usuário), e conta interna
  no Pro perdeu o pagamento na mesa (M-4). Dono decidiu em 2026-10-19: conta interna vale no mínimo
  Business. `effectiveTier` / `restaurantTier` em `lib/tier-guard.ts`, usados por todo lugar que decide
  recurso ou limite. Para testar o Pro, desligar "Conta interna" naquela conta.
- **Aviso de validades da manhã incluía o Pro** (`lib/labels/morning-alert.ts`), mas o controle de
  validades é Business desde 2026-10-18.

### Aceitos (não mexer sem pedido)

- I-4: plano pago vencido não fecha mesas abertas enquanto travado (dono aceitou em 2026-10-18).
- Risco v1: quem nunca recarrega a sessão fica com o JWT antigo (sem trava) até o próximo refresh.

### Menores, sem pressa

- **Teste instável (RESOLVIDO 2026-10-19)**: `__tests__/integration/api/consumption-default.test.ts` dava 2 ou 1
  em vez de 3,5 às vezes. Causa: o `createdAt` gravado sai alguns ms à frente do relógio do processo de teste
  (medido: 1500 de 1500 linhas, até 8 ms; banco de teste no Docker/WSL2), e a rota filtra `createdAt <= agora`.
  Quando a rota roda logo depois dos INSERTs, os últimos movimentos ficam "no futuro" e saem da soma. O teste
  agora cria os movimentos com `createdAt` de 1 minuto atrás. Sem efeito em produção (ms num relatório de 30
  dias). Outro teste que crie linhas e filtre "até agora" logo em seguida pode ter o mesmo problema.

- O teste do gateway arredonda para cima os dias que faltam (`remainingTrialDays`, Math.ceil): até 1 dia
  grátis a mais para quem assina no meio do teste.

## Contas a pagar (2026-10-18)

O registro original (`.superpowers/sdd/2026-10-18-contas-a-pagar/progress.md`) se perdeu; o texto abaixo vem do commit.

### Abertos

Nenhum.

### Resolvidos (ec2b6f4, M-1..M-9)

- Desfazer um pagamento pela gaveta espera a despesa ser gravada (devolvia dinheiro de uma despesa ainda em gravação).
- Aviso da manhã: um restaurante com erro não para os outros; erros vão para o Sentry.
- "Esta e as próximas": esta conta mantém data, observação e fornecedor digitados; as próximas recebem o fornecedor.
- A sincronização das contas de consumo respeita a conta cancelada pelo dono e o nome editado em Contas a pagar.
- NF-e sem chave, número e CNPJ é diferenciada pelo conteúdo.
- Pagamento pela gaveta é sempre dinheiro; conta de consumo não é digitada à mão.
- A DRE marca as contas contadas pelo mês inteiro num período parcial.
- O título do e-mail conta os próximos 3 dias, como a lista; o link segue o ambiente.
- Série muito à frente: aviso claro em vez de "0 contas lançadas".

## IA de implantação (2026-10-17)

Da revisão final de 2026-10-17 (sessão 5f0672cc). O registro original foi apagado depois da publicação.

### Abertos

- **Rascunho de equipe gasto quando todos falham** (`lib/ai/drafts/apply.ts`, apply de STAFF): o rascunho vira
  APPLIED antes de as pessoas serem criadas. Se todas falham (e-mail já é equipe em outro restaurante, limite do
  plano), nada é feito e reabrir só diz "já confirmado". Correção: voltar para PENDING quando
  `people.every(p => !p.ok)`, ou checar e-mails e limite antes de marcar. Desde b8ef71f o Starter cheio é
  recusado antes do rascunho, o que reduz o caso.
- **Rascunho perdido num erro da rodada seguinte** (`lib/ai/ask.ts`): se `propor_*` criou o rascunho na rodada 1
  e a rodada 2 falha, o 503 volta com `drafts: []` e o dono não vê o botão. Correção: devolver `drafts` também no 503.
- **Descartar ignora falha** (`app/implantacao/revisar/[id]/page.tsx`, `discard`): mostra "descartado" mesmo com
  404/409/erro de rede; `discardDraft` responde 200 quando o `updateMany` não achou nada (perdeu a corrida com o apply).
- **Nomes repetidos dentro do mesmo rascunho**: a segunda cópia aparece em "Pulados (já existiam)", o que engana.
- **Fotos reenviadas a cada rodada sem `cache_control`**: um ponto de cache no último anexo baratearia as rodadas 2+.
- **Busca da implantação para todos os papéis**: o chat chama `/api/ai/onboarding` também para caixa e cozinha
  (um 403 por sessão), e o cartão/contador não se atualiza depois de confirmar, só ao recarregar.
- ~~**E-mail de outro restaurante revelado**~~ (RESOLVIDO 2026-10-20): a revisão do rascunho não marca mais
  "Já é funcionário em outro restaurante" e a Equipe (`lib/staff/create-member.ts`) recusa com "Este e-mail não pode
  ser cadastrado aqui. Use outro e-mail para esta pessoa.", sem dizer o motivo. A recusa continua (a pessoa só pode
  ser funcionária de um restaurante), então quem tenta cadastrar ainda sabe que o e-mail está em uso.

### Resolvidos

- Área das mesas com maiúscula/minúscula diferente, numeração depois das mesas existentes, mesas de exemplo
  removíveis. b8ef71f.

## Pergunte ao Gastrux (IA, 2026-10-16)

Registro em `.superpowers/sdd/2026-10-16-ia-assistente/progress.md` (só local, fora do git).

### Abertos

- **M3**: os resultados da 6ª rodada de ferramentas são descartados.
- **M5**: `mesas_agora` ignora adicionais e pagamentos parciais.
- **M6**: `AiQuestion.user` em Cascade: apagar um funcionário apaga as perguntas dele e libera cota do mês.
- **M7**: falta uma tela de custo da IA por restaurante para a plataforma; no Starter a caixa "Análise detalhada"
  não aparece travada de início; o contador só aparece depois da primeira resposta.
- **M8**: nenhum teste prova que `contas_consumo` não grava nada.

### Resolvidos

- M7 (parte): negrito aparecia com asteriscos. bbe89b9.

## Contas de consumo (2026-10-16)

Da revisão final de 2026-10-16 (sessão 118ba5cf), com a numeração dela. O registro original foi apagado depois da publicação.

### Abertos

- ~~**2. Ponto no consumo**~~ (RESOLVIDO 2026-10-20): a leitura continua ("1.500" = 1500, como na conta), mas a
  tela mostra abaixo do campo "Vai ser gravado: 1.500 m³" e avisa que o ponto separa milhar.
- **3. Duas gravações ao mesmo tempo** (`lib/utility-bills/service.ts` saveBill, `alert.ts`): duas gravações da
  mesma conta e mês leem `previous = null`; a segunda sobrescreve sem auditoria e as duas dizem `corrected: false`.
  O aviso é "verifica e cria" sem chave única, então o sino pode tocar duas vezes. Correção: auditoria numa
  transação ou chave única para o aviso.
- **6. % das vendas usa mês parcial** quando a última conta é do mês corrente (indicadores em service.ts):
  exagera a fatia. Marcar "mês em andamento" ou usar o mês anterior.
- **7. Nome do campo invertido**: `contasConsumoMesInteiro` (`lib/finance/dre.ts`) é `true` quando o período é
  parcial (mostra a nota "entram pelo mês inteiro"). Renomear para `contasConsumoNotaMesInteiro`.
- ~~**8/9. Data impossível dá 500**~~ (RESOLVIDO 2026-10-20: `isValidYmd` em `lib/dates.ts` na DRE, no vencimento
  e no período da IA, que dava RangeError com mês 13; vencimento inválido agora é 400 em vez de virar vazio): a DRE agora valida o formato AAAA-MM-DD (c3b8637), mas uma data como
  `2026-02-31` ainda não volta 400; o mesmo vale para `dueDate` em saveBill (`lib/utility-bills/service.ts:65`,
  só regex). A tela não manda isso; a API aceita.
- **12. Pequenas diferenças da spec**: o gráfico do Pro mostra uma série por mês (consumo ou valor), não as duas;
  o PATCH da conta deixa renomear qualquer tipo (a spec diz só "Outra"; a tela não renomeia); o GET devolve
  cerca de 15 meses em vez de 13 (inofensivo).
- **14. `createdById` com ON DELETE RESTRICT** (`UtilityBill`, migração 20261016150000_utility_bills): apagar um
  usuário que lançou contas vai falhar. Hoje não existe exclusão de usuário (a da LGPD está comentada);
  resolver quando ela existir.

### Resolvidos

- Importante 1: `"1.240"` era gravado como R$ 1,24 (ponto de milhar). Importante 2: não dava para adicionar
  "Outra conta" ou botijão depois das 4 contas fixas. Menores 1 (valor zero depois de arredondar), 4 ("Corrigir"
  num mês fora da lista), 5 (aviso sem ano e sino para meses antigos) e 11 (conta fixa duplicada em vez de
  reativar). Todos na publicação b6b05cf.
- 10: desativar sem confirmação, 24388c2. 13: a tela usa `shouldAlert` em vez de repetir a regra.

## Contagem de espetos (2026-10-16)

Da revisão final de 2026-10-16 (sessão 118ba5cf), com a numeração dela. O registro original foi apagado depois da publicação.

### Abertos

- **M2. Desfazer durante um fechamento** (`lib/daily-count/service.ts` deleteEntry): não pega a trava da noite.
  Uma exclusão gravada entre a leitura e o commit do fechamento tira um lançamento que a linha congelada já
  contou: a pessoa acha que desfez, mas o fechamento o inclui. Correção: transação com `SELECT … FOR UPDATE` na
  noite e checar o status de novo.
- **M4. P2002 dentro da transação** (`lib/daily-count/service.ts` openNight): o retry depois do P2002 roda numa
  transação que o Postgres já abortou e dá 500. Só acontece nos primeiros toques de um restaurante sem nenhuma
  noite. Correção: abrir a noite com `prisma` antes da transação, ou `INSERT … ON CONFLICT DO NOTHING`.
- **M6. Venda gravada no milissegundo do fechamento**: um item com `createdAt < closedAt` cujo commit chega depois
  da leitura do fechamento não entra em nenhuma noite. Janela de milissegundos; só anotado.
- **M8. Diferenças da spec**: título do aviso "Contagem com diferença" (spec: "Contagem de 15/10: …",
  `lib/daily-count/close.ts`); menu sempre "Contagem do dia", inclusive para espetaria (`lib/navigation/app-nav.ts`);
  rota `/contagem-do-dia` (spec: `/contagem`, que já era a contagem de estoque); histórico "por semana (últimas 4)"
  virou um total de 4 semanas (`lib/daily-count/history.ts`).
- **M9. Espeto cancelado na cozinha depois de assado** não conta como vendido nem como perda, então aparece em
  "faltam". withdraw-line/kds-cancel gravam perda de insumo, mas não LOSS na contagem. Opção: somar em perda
  automaticamente, ou explicar na tela.
- **M10. Teste fraco**: `daily-count-close.test.ts` (lançamento durante o fechamento) aceita os dois resultados e
  não prova a espera da trava. Um teste determinístico seguraria a trava com `FOR UPDATE`, mandaria o lançamento
  e só então faria o commit.
- **M11. Histórico agrupado pelo nome** (`lib/daily-count/history.ts`, byItem): uma receita renomeada vira duas
  linhas. Agrupar por recipeId com o nome mais recente.

### Resolvidos (na publicação eb2ee7e)

- C1: vendidos contavam só o que ia para a cozinha (venda balcão não enviada dava "faltam"). Agora contam as
  linhas das comandas não canceladas mais os pedidos sem comanda.
- I1: fechamento preso ao countId da tela e idempotente. I2: abertura uma vez por item e noite. A sobra trazida
  não pode ser apagada; faltas e sobras separadas no histórico; erros nos diálogos e de Wi-Fi (M1); M3, M5 e M7.

### Decisão do dono (o revisor não julgou)

- O cozinheiro vê o histórico com valores em R$ (diferença pelo custo).
