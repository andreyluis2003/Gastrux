# Pendências

Tudo o que uma revisão deixou para depois fica aqui, por extenso (o quê, onde, por quê), e sai daqui com o
commit que resolveu. Os registros em `.superpowers/sdd/` não vão para o git e se perdem: não servem para isso.

## Planos novos (2026-10-18), revisão de 2026-10-19

O registro original se perdeu; M-1, M-2, M-4 e M-5 foram recuperados do histórico da sessão de 2026-10-18.

### Abertos

- **M-1. Plataforma pode deixar um plano pago "em teste"**: a edição genérica de cliente
  (`app/api/admin/customers/[id]/route.ts:63-70`, `lib/admin/customer-service.ts` updateCustomer) põe o
  plano 'pro' e deixa o status 'trialing'. Sem assinatura no gateway, o restaurante trava quando
  `trialEndsAt` passa. Correção sugerida: ao escolher um plano pago, gravar status 'active' (ou avisar na tela).
- **M-2. "Estender teste" depois de um cancelamento do Mercado Pago é desfeito**: `extendTrial` transforma
  em teste do Business o restaurante travado pelo cancelamento (I-1), mas `expireEndedSubscriptions`
  (`lib/billing/subscription-sync.ts`) ainda vê o plano 'pro' no usuário e grava 'starter', cortando a extensão.
- **M-5. Depois de pagar, a trava pode durar até 5 minutos**: `app/billing/success/page.tsx` chama
  `update()` quando a consulta diz sucesso, o que pode ser antes de o webhook copiar o plano para o
  restaurante. Correção sugerida: chamar `update()` de novo depois de alguns segundos, ou esperar a cópia.

### Resolvidos

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

- O teste do gateway arredonda para cima os dias que faltam (`remainingTrialDays`, Math.ceil): até 1 dia
  grátis a mais para quem assina no meio do teste.
