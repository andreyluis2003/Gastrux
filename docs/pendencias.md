# Pendências

Tudo o que uma revisão deixou para depois fica aqui, por extenso (o quê, onde, por quê), e sai daqui com o
commit que resolveu. Os registros em `.superpowers/sdd/` não vão para o git e se perdem: não servem para isso.

## Telas escondidas (decisão do dono, 2026-10-19)

Apagadas (cada endereço antigo redireciona): /tutorial → /ajuda, /estoque-rapido → /estoque/entrada,
/notas-fiscais → /admin/nfe-import, /custo-analise → /receitas, /alertas, /alertas-inteligentes e
/previsoes-demanda → /dashboard, /vendas-rapidas → /vender, /settings/pos e as telas de voz → /admin/settings.
Corrigida: /escalonamento (Escalonar receita, em Mais recursos).

### Abertos

- ~~**Rotas da API sem tela**~~ (apagadas em 2026-10-23, nenhuma tela as chamava): `/api/stock/quick-movement`,
  `/api/invoices/process-ocr`, `/api/cost-analysis/*`, `/api/alerts`, `/api/smart-alerts/*`, `/api/pos/{transactions,settings}`
  (as da tela PDV são `/api/admin/pos/*` e ficam; `/api/pos/webhook` também), `/api/demand-forecast`, `/api/admin/voice/*`,
  `/api/voice/webhook/*`, `/api/loyalty/*`, `/api/cashback` (GET/POST antigos), `/api/cashback/{stats,redeem}`,
  `/api/indicacao`, `/api/financial/*`, `/api/reports/{comprehensive,forecasts,production-planning,stock-status,
  suppliers,demand}`, com `lib/pdf-generator.ts` (Abacus), `lib/report-templates.ts`, `lib/voice/`, `lib/loyalty/` e
  `hooks/use-restaurant-data.ts`. Páginas que levavam a elas e agora redirecionam: /admin/indicacao → Cashback;
  /dashboard/reports e /dashboard/reports/demand (Previsão de demanda, com PDF de mentira) → Financeiro.
- ~~**Tabelas sem uso no banco**~~ (2026-10-23, decisão do dono depois de conferir produção: só os restaurantes de
  teste dele): migração `20261023180000_drop_old_loyalty_and_voice` apaga `loyalty_*` (6 tabelas), `voice_agent_configs`,
  `voice_calls` e os tipos `LoyaltyTier`, `VoiceProvider`, `VoiceCallStatus` e `VoiceCallOutcome`.
- ~~**/admin/alertas-smart**~~ (2026-10-23, decisão do dono): apagada com `/api/alertas/smart`; o endereço leva ao Início.
- ~~E-mail do 3º dia~~: apagado em 2026-10-19 com a sequência antiga (ver "E-mails de onboarding").

## Plataformas de delivery, parte 1: API de pedidos (2026-10-24)

Spec `docs/superpowers/specs/2026-10-23-delivery-plataformas-design.md`, plano `docs/superpowers/plans/2026-10-23-api-de-pedidos.md`,
migração `20261024120000_order_api`.

### Abertos

- **Pedidos do site ignoram o "Aceitar"**: com "Aceitar pedidos sozinho" desligado, os pedidos do cardápio digital
  continuam indo direto para a cozinha, porque o pagamento online (Mercado Pago) se prende ao pedido da cozinha criado na
  hora. Para valer também no site, o pagamento teria de esperar o aceite ou o pedido ficar parado na cozinha.
- **Webhook antigo** `/api/external/orders/webhook` (formato com `x-platform`, testado no bad-day) continua, sem ninguém que o use,
  até a parte 2 (Open Delivery) passar a usar `ingestDeliveryOrder`.
- **Aviso de status sem nova tentativa**: se o sistema de origem não responder em 5 s, o aviso não é repetido (fica no
  registro do pedido); a página `/desenvolvedores` diz para consultar o status. O envio real por https (`callbackTransport.send`)
  não tem teste automatizado: os testes trocam o envio.
- **Cancelar em Pedidos de delivery** um pedido já aceito é recusado: cancela-se pela tela da cozinha (exige gerente).
- **Pedido aceito sem nenhum item reconhecido**: fica "Confirmado" sem pedido da cozinha (o sino avisa "NÃO foi para a
  cozinha"), mas a API responde "aceito". Melhor: deixar o pedido parado à espera de correção e responder isso.
- **Valor bruto no Caixa**: o pedido da cozinha guarda o total bruto (itens + taxa) e o desconto à parte, como a DRE espera;
  o cartão de vendas do Caixa soma o bruto de um pedido da API com desconto.
- **Sem limite de envios** em `/api/v1/pedidos`: uma chave vazada pode mandar muitos pedidos até ser revogada.
- **"Delivery: cardápio digital" na DRE** soma todo pedido de delivery que não veio da API (inclusive o do bot de WhatsApp sem comanda).
- **Partes 2 e 3** (Keeta, 99Food e Rappi pelo Open Delivery; iFood pela Merchant API) esperam as contas de desenvolvedor
  da Gastrux em cada plataforma, que só o dono pode criar.

## Telas fora do menu, segunda revisão (decisão do dono, 2026-10-23)

- **No menu agora**: Cardápio e produtos > Adicionais (`/admin/modifiers`; quebrava com o erro #310 do React, hook depois
  de um `return`; artigo de ajuda "Como cadastro adicionais"); Plataforma > Feedback dos clientes e Roadmap. Teste novo
  `page-hook-order.test.ts` confere a ordem dos hooks em toda tela do menu.
- **Apagadas, com o endereço levando à tela certa**: Multi-unidade (→ Várias lojas), Relatório de desperdício (→ Desperdício),
  Cardápio sazonal (→ Cardápio digital), Cardápio temporal e Combos com IA (→ Engenharia de cardápio), Agendamento (→ Pedidos
  de delivery), Performance da equipe (→ Comissões), Vídeo de demonstração (→ Plataforma), Design e Configuração da IA
  (→ Início), ANVISA (→ Validades) e `/dashboard/ai-insights` (→ Início). Com elas, as rotas `/api/multi-unidade`,
  `/api/desperdicio/report`, `/api/cardapio/sazonal`, `/api/performance/equipe`, `/api/admin/demo-video`, `/api/admin/ai-config`,
  `/api/ai-insights/*` (Abacus) e `/api/anvisa/*`, o aviso de alertas do Início e `lib/ai/llm-client`, `lib/ai/gather-restaurant-data`,
  `lib/s3` e `lib/aws-config`. Ficam no banco, sem uso: `ai_insights` (o cardápio do QR ainda lê combos fixados), `ingredient_batches`.
- **Ficam escondidas, de propósito**: QR na embalagem, ROI da migração e Campanha de reconquista (esperam o WhatsApp e a
  integração com o iFood, como as Campanhas); PDV (`/admin/pdv`, recebe vendas de outro sistema; espera a decisão da maquininha).
- ~~**/suporte/ia e /admin/ia-monitoring**~~ (apagados em 2026-10-23, decisão do dono): um chatbot da Abacus numa janela, sem
  link, e o painel que o acompanhava; com `/api/ai-support/*` e `lib/ai-support`. Os endereços levam à Central de ajuda e ao
  Custo da IA. A tabela `ai_support_interactions` fica no banco, sem uso.
- ~~**Indicação de restaurantes**~~ (apagada em 2026-10-23, decisão do dono): `/settings/referral` (→ Início), `/api/referrals/*` e
  `lib/referral-tiers.ts`; `/settings` (→ Minha conta). Prometia "ganhe R$ 50 em créditos" que a cobrança nunca usava, e o link
  `/?ref=` não era lido no cadastro. Os campos `users.referral*` e a tabela `referral_history` ficam no banco, sem uso. Um
  programa de indicação de verdade (link lido no cadastro, desconto na fatura, regra clara) fica para o backlog, se o dono quiser.

## Telas que não funcionam (achadas nos artigos da Central de Ajuda, 2026-10-20)

Nenhum artigo da /ajuda ensina estas telas (o teste `help-seed-articles.test.ts` impede citar Cashback,
Previsões e Relatório executivo). Todas estão no menu e esperam decisão do dono.

- ~~**Fidelidade e Cashback**~~ e ~~**Clientes (CRM)**~~ (resolvidos 2026-10-23 pelo cashback, spec
  `docs/superpowers/specs/2026-10-23-cashback-design.md`, migração `20261023120000_cashback`). As rotas antigas foram
  apagadas na limpeza de 2026-10-23 (ver "Telas escondidas"). Delivery só acumula
  (spec §4.a): usar o saldo no site espera o código de confirmação pelo WhatsApp (verificação da Meta).
  Era assim: nenhuma venda gerava pontos nem cashback. `POST /api/cashback`
  (credita o cashback e soma `Customer.totalSpent`) não é chamado por nenhuma tela nem pelo fechamento de conta;
  os pontos só entram por `/api/indicacao`. Os "marcos" de `/dashboard/loyalty/milestones` são gravados e nunca
  aplicados a pedido nenhum. `/dashboard/loyalty` não tem botão para criar programa (o programa padrão só nasce em
  `lib/loyalty/get-program.ts`, chamado pelo cashback e pela indicação). O site (why-gastrux.tsx e /pricing) vende
  "Campanhas e programa de fidelidade" no Business.
- ~~**Clientes (CRM)**~~ (resolvido 2026-10-23 pelo cashback: total gasto, compras, ticket médio e segmento vêm das
  vendas com o celular do cliente). Era assim: esses números nunca eram atualizados pelas vendas.
- **Campanhas**: exigem um provedor de WhatsApp configurado (Meta, Take Blip ou Zenvia) e template aprovado; a lista
  de destinatários é digitada (telefone|nome|1=valor) e as variáveis são JSON. Não testado de ponta a ponta.
- ~~**Relatórios > Financeiro**~~ (resolvido 2026-10-23: `lib/finance/overview.ts` + `/api/financeiro/resumo`, com os
  números da DRE e do Caixa e a previsão do mês; Previsões e Análises redirecionam para o Financeiro, Fluxo de Caixa
  para o Histórico de caixas. As rotas `/api/financial/*` foram apagadas na limpeza de 2026-10-23). Era assim: o "Resumo de Hoje" e os métodos de pagamento vinham de
  `Payment` (só pagamentos online), `CashFlowRecord` (lançamentos manuais do Fluxo de Caixa) e `Order`, não do
  critério do Caixa/DRE (`salesInRange`). **Previsões** (`/api/financial/calculate-forecast`): "Receita" é a média
  de um pagamento, "Pedidos" soma 1 por pedido e divide pelo número de pedidos (sempre 1), a média ponderada soma
  pesos sem dividir e a confiança é fixa (0,7/0,75/0,85). **Análises** (`/api/financial/metrics`) e **Fluxo de
  Caixa** não foram conferidos. Só o link para a DRE está certo.
- ~~**Relatórios > Relatório executivo (PDF)**~~ (resolvido 2026-10-23: `lib/reports/executive.ts`, página para
  imprimir ou salvar em PDF no navegador, com o CMV da DRE e a engenharia de cardápio de `lib/menu-engineering/
  analyze.ts`; a fatura de Minha assinatura > Cobrança também virou página, com os campos do cliente escapados. As rotas que ainda usavam `lib/pdf-generator.ts` (Abacus) foram
  apagadas com ele na limpeza de 2026-10-23). Era assim: `app/api/reports/executive/route.ts` gerava o PDF em
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

- ~~**Outros e-mails ainda pela Abacus.ai**~~ (decisão do dono, 2026-10-23): os alertas da Plataforma
  (`lib/admin-alerts.ts`) saem pelo Resend; os segmentados (`check-segmented-emails`, send-new-user, send-inactive,
  send-early-adopter) e `/api/admin/batch-email-send` (com `lib/email-ab-test.ts`) foram apagados.
- ~~**Lembrete de reserva**~~ (2026-10-23, decisão do dono: apagar as Reservas, tela escondida que nunca foi usada):
  saíram `/admin/reservations` (leva ao Início), a página pública `/reservations/[restaurantId]` (404), `/api/reservations/*`,
  `/api/admin/reservations/*` e `/api/email/send-reminder`.
- **Tabelas das Reservas**: `reservations`, `reservation_reminders` e `guest_profiles` continuam no banco (ainda citadas por
  `app/api/admin/tables/[id]`, que recusa apagar mesa com reserva, por `lib/kds-integration.ts` e pela relação
  `Order.reservationId`). Apagar numa migração própria, depois de conferir em produção o que elas guardam, como foi feito
  com a fidelidade e a voz.
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

Nenhum.

- ~~**E-mail de outro restaurante revelado**~~ (RESOLVIDO 2026-10-20): a revisão do rascunho não marca mais
  "Já é funcionário em outro restaurante" e a Equipe (`lib/staff/create-member.ts`) recusa com "Este e-mail não pode
  ser cadastrado aqui. Use outro e-mail para esta pessoa.", sem dizer o motivo. A recusa continua (a pessoa só pode
  ser funcionária de um restaurante), então quem tenta cadastrar ainda sabe que o e-mail está em uso.

### Resolvidos

- 2026-10-23 (testes em `__tests__/integration/staff/ai-drafts*.test.ts` e `ai-ask.test.ts`):
  - Rascunho de equipe em que todos falham volta para pendente; a tela mostra "Corrigir e confirmar de novo".
  - Rascunho criado antes de um erro da rodada seguinte volta também no 503, e o chat mostra o botão dele.
  - Descartar responde 409 quando perdeu a corrida com um "Confirmar", e a tela só diz "descartado" com 200 (em
    409 relê o estado; sem internet, avisa que não descartou).
  - Nome repetido dentro do mesmo rascunho aparece em "Repetidos no rascunho", não em "Pulados (já existiam)".
  - Fotos e PDF: ponto de cache depois dos anexos, para as rodadas 2+ saírem mais baratas.
  - O chat só lê o cartão da implantação para dono, gerente e admin, e relê a cada vez que abre (sem teste
    automatizado: é só a tela).
- Área das mesas com maiúscula/minúscula diferente, numeração depois das mesas existentes, mesas de exemplo
  removíveis. b8ef71f.

## Pergunte ao Gastrux (IA, 2026-10-16)

Registro em `.superpowers/sdd/2026-10-16-ia-assistente/progress.md` (só local, fora do git).

### Abertos

- **M6**: `AiQuestion.user` em Cascade: apagar um funcionário apagaria as perguntas dele e liberaria cota do mês.
  Hoje nenhuma parte do Gastrux apaga usuário (a exclusão da LGPD em `lib/lgpd-compliance.ts` está comentada);
  resolver junto com o item 14 das contas de consumo, quando a exclusão existir.
- **M7 (resto)**: o contador de perguntas do chat só aparece depois da primeira resposta (não há leitura do uso ao
  abrir). A caixa "Análise detalhada" do Starter deixou de importar: desde 2026-10-18 o Starter é "sem plano", sem IA.

### Resolvidos

- M7 (parte): negrito aparecia com asteriscos. bbe89b9.
- M7 (parte, 2026-10-23): Plataforma > Custo da IA (`/admin/platform/ia`, `lib/admin/ai-costs.ts`): por restaurante e mês de
  Brasília, perguntas contra o limite, custo em US$ (soma também as chamadas com erro), tokens, detalhadas, com arquivo e erros.
- 2026-10-23: M3 (a última rodada vai com `tool_choice: none` e responde com o que as anteriores acharam), M5
  (`mesas_agora` usa a conta da tela Vender: total com adicionais e taxa, pago e falta) e M8 (teste prova que
  `contas_consumo` não grava nada). Testes em `ai-ask.test.ts` e `ai-tools.test.ts`.

## Contas de consumo (2026-10-16)

Da revisão final de 2026-10-16 (sessão 118ba5cf), com a numeração dela. O registro original foi apagado depois da publicação.

### Abertos

- ~~**2. Ponto no consumo**~~ (RESOLVIDO 2026-10-20): a leitura continua ("1.500" = 1500, como na conta), mas a
  tela mostra abaixo do campo "Vai ser gravado: 1.500 m³" e avisa que o ponto separa milhar.
- ~~**8/9. Data impossível dá 500**~~ (RESOLVIDO 2026-10-20: `isValidYmd` em `lib/dates.ts` na DRE, no vencimento
  e no período da IA, que dava RangeError com mês 13; vencimento inválido agora é 400 em vez de virar vazio): a DRE agora valida o formato AAAA-MM-DD (c3b8637), mas uma data como
  `2026-02-31` ainda não volta 400; o mesmo vale para `dueDate` em saveBill (`lib/utility-bills/service.ts:65`,
  só regex). A tela não manda isso; a API aceita.
- **12. Pequenas diferenças da spec** (o resto foi resolvido em 2026-10-23): o gráfico mostra uma série por mês
  (consumo ou valor), não as duas; o GET devolve cerca de 15 meses em vez de 13 (inofensivo).
- **14. `createdById` com ON DELETE RESTRICT** (`UtilityBill`, migração 20261016150000_utility_bills): apagar um
  usuário que lançou contas vai falhar. Hoje não existe exclusão de usuário (a da LGPD está comentada);
  resolver quando ela existir.

### Resolvidos

- Importante 1: `"1.240"` era gravado como R$ 1,24 (ponto de milhar). Importante 2: não dava para adicionar
  "Outra conta" ou botijão depois das 4 contas fixas. Menores 1 (valor zero depois de arredondar), 4 ("Corrigir"
  num mês fora da lista), 5 (aviso sem ano e sino para meses antigos) e 11 (conta fixa duplicada em vez de
  reativar). Todos na publicação b6b05cf.
- 10: desativar sem confirmação, 24388c2. 13: a tela usa `shouldAlert` em vez de repetir a regra.
- 2026-10-23 (testes em `utility-bills.test.ts` e `utility-dre.test.ts`): 3 (gravar a mesma conta e mês espera a
  outra gravação, com trava; o aviso checa e cria sob trava, toca uma vez), 6 (% do faturamento só para mês que já
  terminou; ajuda e IA dizem isso), 7 (`contasConsumoNotaMesInteiro`, também na resposta da IA, que lia ao contrário)
  e 12 em parte (só "Outra conta" muda de nome pela API).

## Contagem de espetos (2026-10-16)

Da revisão final de 2026-10-16 (sessão 118ba5cf), com a numeração dela. O registro original foi apagado depois da publicação.

### Abertos

- **M6. Venda gravada no milissegundo do fechamento**: um item com `createdAt < closedAt` cujo commit chega depois
  da leitura do fechamento não entra em nenhuma noite. Janela de milissegundos; só anotado.
- **M8. Diferenças da spec**: título do aviso "Contagem com diferença" (spec: "Contagem de 15/10: …",
  `lib/daily-count/close.ts`); menu sempre "Contagem do dia", inclusive para espetaria (`lib/navigation/app-nav.ts`);
  rota `/contagem-do-dia` (spec: `/contagem`, que já era a contagem de estoque); histórico "por semana (últimas 4)"
  virou um total de 4 semanas (`lib/daily-count/history.ts`).
### Resolvidos (2026-10-23, teste `__tests__/integration/staff/daily-count-locks.test.ts`)

- M2: desfazer um lançamento espera o fechamento em andamento (trava da noite) e é recusado se ela fechou.
- M4: a primeira noite nasce com `INSERT … ON CONFLICT DO NOTHING` (`createMany skipDuplicates`); o 500 sumiu.
- M10: testes que seguram a trava da noite e só então mandam o lançamento ou o desfazer.
- M11: o histórico soma por receita, com o nome mais recente; receita apagada continua pelo nome.
- M9 (decisão do dono): espeto cancelado depois de a cozinha começar (pedido inteiro ou item tirado da comanda) entra
  sozinho como perda "Cancelado na cozinha" da noite aberta (`recordKitchenCountLoss`, teste
  `daily-count-kitchen-loss.test.ts`). Caso raro que sai errado: a cozinha cancela e a linha continua na conta e é
  cobrada; aí ele conta como vendido e como perda (a contagem mostra uma sobra).

### Resolvidos (na publicação eb2ee7e)

- C1: vendidos contavam só o que ia para a cozinha (venda balcão não enviada dava "faltam"). Agora contam as
  linhas das comandas não canceladas mais os pedidos sem comanda.
- I1: fechamento preso ao countId da tela e idempotente. I2: abertura uma vez por item e noite. A sobra trazida
  não pode ser apagada; faltas e sobras separadas no histórico; erros nos diálogos e de Wi-Fi (M1); M3, M5 e M7.

### Decisão do dono (o revisor não julgou)

- O cozinheiro vê o histórico com valores em R$ (diferença pelo custo).
