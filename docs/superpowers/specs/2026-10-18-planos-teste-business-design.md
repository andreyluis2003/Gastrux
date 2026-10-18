# Planos novos: teste de 30 dias do Business, Pro R$ 149, Business R$ 199 — Design

**Data:** 2026-10-18
**Status:** design aprovado em chat (3 partes + extensão de teste), aguardando revisão deste documento
**Origem:** pedido do dono: rever os planos para que a maioria dos clientes queira o Business e a receita mensal por cliente suba.

## 1. Problema

Hoje há um plano Starter grátis para sempre, o Pro a R$ 99 e o Business a R$ 249. Com o Business custando 2,5 vezes o Pro e o Starter liberando venda, caixa, NFC-e, cozinha e cardápio, quase nenhum restaurante tem motivo para pagar o Business. O cadastro já grava "teste de 30 dias" (`trialEndsAt`), mas nada usa essa data.

## 2. Objetivo e critério de sucesso

Todo restaurante novo conhece o Business por 30 dias e, ao fim, escolhe entre um Pro que só opera e um Business R$ 50 mais caro que traz dinheiro e evita perdas.

**Sucesso:**
- cadastro novo entra com tudo do Business por 30 dias, sem cartão, e vê quantos dias faltam;
- no 31º dia sem plano, o restaurante vê tudo mas não grava nada (nem pelos pedidos de clientes) até pagar;
- ao pagar, libera na hora; ao cancelar um plano pago, segue até o fim do período e depois bloqueia;
- a equipe da Plataforma estende o teste de um cliente em dois cliques, com motivo registrado;
- nenhum texto do site, do sistema, dos e-mails, da ajuda ou da IA fala em plano grátis para sempre ou nos preços antigos.

## 3. Decisões do dono (2026-10-18)

1. **Fim do Starter grátis** para clientes novos: teste de **30 dias com tudo do Business**, sem cartão.
2. **Estações de cozinha:** Pro 2, Business 5, ilimitadas só no Enterprise.
3. **Vendas por mês:** Business 3.500 (era 3.000); Pro 1.000 (era 1.500). Continua só avisando, nunca bloqueia (decisão de 2026-10-09).
4. **Dia 31 sem plano:** bloqueio com leitura.
5. **Preços:** Pro R$ 149, Business R$ 199; anual = 11 meses pelo preço de 12 (R$ 1.639 e R$ 2.189).
6. **Divisão de recursos** (seção 4).
7. **Contas que existem hoje** em produção: todas são de teste, nenhuma de cliente real → todas viram **conta interna** (sem bloqueio, funcionando como Business).
8. **Trava na entrada do sistema** (seção 6), não ação por ação.
9. **Estender teste** pela ficha do cliente na Plataforma, com motivo (seção 8).
10. Os textos da landing e de todo o site mudam junto (seção 9).

## 4. Planos

| | Pro | Business | Enterprise |
|---|---|---|---|
| Mensal / anual | R$ 149 / R$ 1.639 | R$ 199 / R$ 2.189 | sob consulta |
| Vendas por mês (aviso) | 1.000 | 3.500 | ilimitadas |
| Usuários | 2 | 5 | ilimitados |
| Estações de cozinha | 2 | 5 | ilimitadas |
| Perguntas à IA por mês | 50 | 350 | sem limite |
| Insumos / fichas técnicas | 500 / 100 (como hoje) | 1.000 / 500 (como hoje) | ilimitados |
| Vender, caixa, NFC-e, cardápio com QR, estoque, fichas, CMV, compras, anotações de clientes, etiquetas, contagem do dia, contas de consumo | sim | sim | sim |
| Pagamento na mesa (`tablePayment`) | — | sim | sim |
| Controle de validades (`labelExpiry`) | — | sim | sim |
| Indicadores das contas de consumo (`utilityInsights`) | — | sim | sim |
| Aviso de diferença na contagem do dia (`dailyCountAlert`) | — | sim | sim |
| Campanhas, fidelidade, relatórios avançados, até 2 lojas | — | sim | sim |
| Análise detalhada da IA (`DETAILED_TIERS`) | sim (como hoje) | sim | sim |

`lib/billing/pricing-tiers.ts` (preços, `features`, `limits.kitchenStations` 2/5/999999, `limits.users` 2/5, `limits.monthlySales` 1000/3500), `lib/tier-guard.ts` (os 4 recursos acima saem do Pro), `lib/ai/config.ts` (`AI_LIMITS` pro 50). O STARTER sai de `BASE_PRICING_TIERS` exibidos; o valor `'starter'` continua existindo no banco e passa a significar **"sem plano"** (seção 5).

## 5. Ciclo de vida e regra de acesso

**Campo novo:** `Restaurant.isInternal Boolean @default(false)` (migração `20261018120000_plan_access`).

**Cadastro** (`app/api/signup/route.ts` e o cadastro pelo Google em `lib/auth.ts`): restaurante com `subscriptionTier: 'business'`, `subscriptionStatus: 'trialing'`, `status: 'TRIAL'`, `trialEndsAt: agora + 30 dias`. Assim todas as checagens de plano que já existem leem "business" durante o teste, sem mudar cada uma.

**Regra única** `lib/billing/plan-access.ts`, função pura `planAccess(restaurant, now)` → `{ state, daysLeft }`:

| Situação | Estado |
|---|---|
| `isInternal` | `internal` (livre) |
| `subscriptionStatus = 'trialing'` e `trialEndsAt > now` | `trial` (livre, mostra dias restantes) |
| `subscriptionTier` pro/business/enterprise e `subscriptionStatus` `'active'` ou `'past_due'` | `paid` (livre) |
| qualquer outro (teste vencido: `'trialing'` com `trialEndsAt` passado ou vazio; plano encerrado `'starter'`/`'canceled'`) | `locked` |

As regras são checadas nessa ordem. Um teste da própria Stripe (`'trialing'` vindo do gateway, com `trialEndsAt` = fim do teste dela) segue a mesma linha `trial`.

**Pagamento:** `subscription-sync` já grava plano e situação no restaurante ao confirmar (Stripe e Mercado Pago) → vira `paid`.

**Fim de plano pago:** `resolveMirror`/`expireEndedSubscriptions` hoje voltam o restaurante para `'starter'` (grátis). Continua gravando `'starter'`, que agora significa sem plano → `locked`. O cancelamento (`lib/billing/cancel.ts`) não muda: segue até o fim do período pago.

**Avisos de fim de teste:** rota nova `POST /api/billing/trial-reminders` (só com `CRON_SECRET`), uma vez por dia: para restaurantes em `trial` com 7, 3 e 0 dias restantes (dias 23, 27 e 30), um aviso no sino (dono) e um e-mail pelo Resend ao dono, uma vez por marco (chave de deduplicação por restaurante e marco). **Não há rotina agendada hoje para os e-mails de onboarding**: a linha do crontab do VPS (`0 12 * * *`, 09:00 BRT) entra no roteiro de deploy.

**IA:** a regra "100 perguntas grátis nos primeiros 30 dias" (`FREE_DAYS`, `FREE_QUESTIONS` em `lib/ai/ask.ts` e `lib/ai/usage.ts`) sai: o teste já tem os 350 do Business. A contagem `ai_questions.free` antiga fica como está (histórico).

**Migração de dados** (na mesma migração): `UPDATE restaurants SET "isInternal" = true` para todos os que existem; os que estão com `'starter'` passam a `'business'`. Nenhuma conta existente é bloqueada.

## 6. A trava (bloqueio com leitura)

**No login (JWT).** O callback `jwt` de `lib/auth.ts` grava `token.planLocked` e `token.planCheckedAt`. Recalcula com `planAccess` do restaurante atual do usuário (mesma escolha de `getCurrentRestaurantId`: `currentRestaurantId` ou o primeiro vínculo ativo) quando passaram 5 minutos, no login e em `trigger === 'update'`. Equipe da Plataforma (`PLATFORM_ADMIN_EMAILS` ou papel ADMIN): nunca travada. A sessão expõe `planState` e `trialDaysLeft` para a faixa da tela.

**Atualização imediata** (`session.update()` no cliente): depois do retorno do checkout (Stripe e Mercado Pago), ao trocar de restaurante e na Plataforma ao estender o teste ou marcar como interna (o próprio admin não está travado; o cliente atualiza no próximo ciclo de 5 minutos ou ao recarregar após a faixa mandar `update`).

**No middleware.** Para `/api/*` com método diferente de GET/HEAD/OPTIONS e `token.planLocked`: resposta `402` `{ error: 'Seu teste terminou. Escolha um plano para voltar a vender.', code: 'PLAN_REQUIRED' }`. Liberadas mesmo travado (prefixos): `/api/auth`, `/api/billing`, `/api/conta`, `/api/password`, `/api/support`, `/api/feedback`, `/api/feature-requests`, `/api/notifications`, `/api/push-notifications`, `/api/signup`. Sem token (clientes, webhooks, rotinas) o middleware não trava: essas rotas se protegem sozinhas (abaixo).

**Pedidos de clientes** (sem login): `app/api/public/delivery/order`, `app/api/public/orders/[qrToken]` (pedido pelo QR), o robô do WhatsApp (`lib/whatsapp/bot.ts`, ao abrir pedido) e `app/api/external/orders/webhook` checam `planAccess` do restaurante; travado → `403 { error: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' }` (no WhatsApp, essa frase como resposta). **Não travam:** a conta e o pagamento de mesa já aberta (`public/table/*`), os avisos de pagamento (`/api/pagamentos/mp/webhook`, `/api/billing/webhook`) e as rotinas com `CRON_SECRET`, para nenhum dinheiro se perder.

**Na tela.** Faixa fixa no topo do app (abaixo da barra superior, como a faixa offline): em `trial`, "Teste grátis: faltam N dias · Escolher plano"; em `locked`, "Teste encerrado: escolha um plano para voltar a vender · Escolher plano" (vermelha). Recusas `PLAN_REQUIRED` aparecem como aviso com o texto do servidor. A fila offline (`lib/offline/outbox.ts`) já trata um 4xx como recusa definitiva (marca "falhou", com Descartar).

## 7. Cobrança

- **Mercado Pago:** o valor sai de `pricing-tiers` → nada a configurar.
- **Stripe:** preços não se editam. O dono cria 4 preços novos (Pro mensal R$ 149, Pro anual R$ 1.639, Business mensal R$ 199, Business anual R$ 2.189) nos produtos já existentes e troca `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_BUSINESS_MONTHLY`, `STRIPE_PRICE_ID_BUSINESS_ANNUAL` no serviço `app`. Os valores padrão em `lib/stripe-config.ts` (preços antigos) são atualizados para os novos ids quando o dono informar.
- Página de preços e Minha assinatura: sem Starter; o Business com o selo "Mais escolhido" e primeiro no celular; texto "Teste grátis por 30 dias, com tudo do Business. Sem cartão." no topo.

## 8. Estender teste e conta interna (Plataforma)

Na ficha do cliente (`app/admin/customers/[id]`), só para a equipe da Plataforma (`requirePlatformAdmin`):
- **Estender teste:** botões +7, +15, +30 dias e "escolher data", com **motivo obrigatório**. Novo fim = (fim atual se ainda no futuro, senão hoje) + N dias. Grava `trialEndsAt`, `subscriptionStatus: 'trialing'`, `subscriptionTier: 'business'` se não houver plano pago (com plano pago o botão não aparece), `status: 'TRIAL'`. Registra auditoria (quem, quando, de/para, motivo) e uma anotação do cliente (`platform_client_notes`).
- **Conta interna:** interruptor com confirmação e motivo, mesma auditoria.
- Rota `POST /api/admin/customers/[id]/trial` `{ days | until, reason }` e `PATCH /api/admin/customers/[id]/internal` `{ isInternal, reason }` (o prefixo `/api/admin/customers` já é só da Plataforma no middleware).
- Lista de Clientes: "Teste até DD/MM" e "estendido N vez(es)" (contado da auditoria); marca "Interna".

## 9. Textos que mudam

"Grátis para sempre", "Starter", "Comece grátis" e os preços antigos viram o teste de 30 dias e os preços novos em:
- **Site:** `app/page.tsx`, `app/pricing/page.tsx`, `app/para/[segmento]/segment-client.tsx`, `lib/marketing/segments.ts`, `app/lp/[campaign]/ppc-client.tsx`, `lib/marketing/ppc-campaigns.ts`, `app/calculadora/page.tsx`, `components/marketing/faq-section.tsx`, `how-it-works.tsx`, `trust-section.tsx`, `why-gastrux.tsx`.
- **E-mails:** `app/api/email/send-welcome`, `send-day7`, `send-new-user` (e os novos avisos de fim de teste).
- **Sistema:** `app/dashboard/billing/page.tsx`, `app/conta/cobranca/page.tsx`, `app/conta/page.tsx`, `components/tier/upgrade-banner.tsx`, `components/upgrade-modal.tsx`, `components/transaction-limit-badge.tsx`, `app/dashboard/usage/page.tsx`, `app/api/billing/subscription-status/route.ts` e as demais que a busca por `starter|grátis|R$ 99|R$ 249` encontrar no plano.
- **Termos de uso** (`app/termos/page.tsx`, seções 2 e 3): troca "(Starter, Pro, Business ou Enterprise)" por "(Pro, Business ou Enterprise)" e explica o bloqueio com leitura ao fim do teste. **O texto novo é mostrado ao dono antes de publicar.**
- **Central de ajuda** (`lib/help/seed-articles.ts`, com o hash antigo em `LEGACY_DEFAULT_HASHES`) e **IA** (`lib/ai/knowledge/planos.ts`, `implantacao.ts`, `pagamento-mesa.ts`, `vender.ts`).
- **Manual** (Claude Doc): parágrafo Planos e roteiro de onboarding.

## 10. Fora do escopo

- Cobrar o cartão no cadastro (o teste é sem cartão).
- Mudar o preço de quem já paga (não há ninguém pagando).
- Desconto de lançamento, cupom ou plano por indicação.
- Apagar dados de restaurantes travados (a exportação de 90 dias dos Termos fica como está).

## 11. Testes

- **Unidade:** `planAccess` (interna, teste em dia, teste vencido, pago, pago encerrado `'starter'`, `trialing` sem data); middleware: `planLocked` recusa POST/PUT/PATCH/DELETE com 402, deixa GET e a lista liberada, não trava a Plataforma; textos de planos (nenhum "grátis para sempre", Starter fora da página de preços); `pricing-tiers` com os números da seção 4; extensão: cálculo da data nova.
- **Integração:** cadastro grava business/trialing/+30 dias; pedido de delivery, pedido pelo QR, WhatsApp e pedido externo recusados com restaurante travado e aceitos com teste em dia; pagamento de mesa já aberta aceito travado; `POST /trial` e `PATCH /internal` só para a Plataforma, com auditoria; `trial-reminders` uma vez por marco; a migração marca as contas atuais como internas.
- **Homolog:** conta nova → faixa "faltam 30 dias"; Plataforma adianta o fim (data de ontem) → faixa vermelha, vender recusado, telas abrindo, pedido pelo QR recusado; Plataforma estende +7 → libera; Pro pago pelo Mercado Pago (valor R$ 149) → libera e mostra só 2 estações.

## 12. Ordem de entrada no ar

1. Publicação na main com a migração `20261018120000_plan_access`.
2. Dono: Deploy `homolog` + `npx prisma migrate deploy`; eu valido (seção 11, homolog).
3. Dono: 4 preços na Stripe + 4 variáveis no `app`; linha do crontab de `trial-reminders`.
4. Dono: Deploy `app` + `npx prisma migrate deploy`; eu confiro site, preços e uma conta nova em produção.

Até o passo 4 a produção segue como hoje.
