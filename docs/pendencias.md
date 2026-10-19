# Pendências

Tudo o que uma revisão deixou para depois fica aqui, por extenso (o quê, onde, por quê), e sai daqui com o
commit que resolveu. Os registros em `.superpowers/sdd/` não vão para o git e se perdem: não servem para isso.

## Planos novos (2026-10-18), revisão de 2026-10-19

O registro original (M-1, M-2, M-4, M-5) se perdeu; esta revisão refez a busca.

### Resolvidos

- **Assinou durante o teste continuava "em teste"**: faixa "faltam N dias / Escolher plano", trava se o
  gateway avisasse a 1ª cobrança com atraso, e "Estender teste" trocava o Pro por teste do Business.
  `lib/billing/plan-access.ts` (subscribedInTrial). Commit 9e19c5a.
- **Loja nova nascia travada**: `app/api/admin/multi-location/route.ts` criava a 2ª loja com
  `subscriptionTier: 'starter'`, que desde 18/10 significa "sem plano". Agora copia o plano da loja atual.
- **Beta testers**: a loja nascia como Starter e "Estender acesso" mudava só o usuário, então a loja
  travava na data antiga. `setOwnerTrialEnd` em `lib/admin/trial.ts`, usado na criação e no "Estender".

### Esperando decisão do dono

- **Contas internas com plano "starter"**: não travam, mas leem os limites de "sem plano": IA com 0
  perguntas (`lib/ai/config.ts`, AI_LIMITS.starter = 0), recursos do Starter em `lib/tier-guard.ts`,
  1 usuário e aviso de vendas "plano sem plano". Atinge as contas marcadas internas em produção que estão em
  starter (ex.: Restaurante Espetaria). Proposta: conta interna lê Business em tudo.

### Aceitos (não mexer sem pedido)

- I-4: plano pago vencido não fecha mesas abertas enquanto travado (dono aceitou em 2026-10-18).
- Risco v1: quem nunca recarrega a sessão fica com o JWT antigo (sem trava) até o próximo refresh.

### Menores, sem pressa

- O teste do gateway arredonda para cima os dias que faltam (`remainingTrialDays`, Math.ceil): até 1 dia
  grátis a mais para quem assina no meio do teste.
