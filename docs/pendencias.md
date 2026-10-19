# Pendências

Tudo o que uma revisão deixou para depois fica aqui, por extenso (o quê, onde, por quê), e sai daqui com o
commit que resolveu. Os registros em `.superpowers/sdd/` não vão para o git e se perdem: não servem para isso.

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

- **Teste instável**: `__tests__/integration/api/consumption-default.test.ts` ("by default: sales, manual
  exits and losses") falhou uma vez na rodada completa de 2026-10-19 e passa sozinho, com e sem as correções
  M-1/M-2/M-5. Provável dependência de dados de outro teste no mesmo banco; investigar.

- O teste do gateway arredonda para cima os dias que faltam (`remainingTrialDays`, Math.ceil): até 1 dia
  grátis a mais para quem assina no meio do teste.
