# Mercado Pago: pausar uma assinatura pula a cobrança? (Tarefa 1 do plano de indicação)

Plano `docs/superpowers/plans/2026-10-24-indicacao.md`. Sandbox do Mercado Pago, vendedor de teste do app
"Gastrux restaurantes", comprador de teste, script `scripts/mp-pause-experiment.ts`.

Assinatura de teste (PreApproval) `a922cb371e6e4063b587213ae6390941`: R$ 5,00 por dia (`frequency=1`, `days`).

| Quando (UTC) | O que foi feito | Resultado |
|---|---|---|
| 26/10 14:37 | Assinatura paga pelo comprador de teste | 1ª cobrança aprovada (7033288636, R$ 5) |
| 26/10 14:38 | `pause` | `paused`; `next_payment_date` 27/10 10:37 -04:00 |
| 27/10 16:59 | Conferido e `resume` | Nenhuma cobrança em 27/10; o MP moveu `next_payment_date` para 28/10 sozinho; voltou a `authorized` |
| 28/10 15:02 | (automático) | 2ª cobrança aprovada (7033352321, R$ 5), só uma |
| 29/10 15:02 | (automático) | 3ª cobrança aprovada (7033397758, R$ 5) |
| 29/10 23:35 | Conferido e cancelada | 3 cobranças no total (R$ 15); `cancelled` |

## Resultado: PASSA

- Pausada, a assinatura não é cobrada na data.
- Ao voltar, o Mercado Pago não cobra o ciclo pulado: segue da próxima data.

Por isso a Tarefa 6 pausa a assinatura de quem indicou antes da próxima cobrança e a retoma no dia seguinte
(`resumeAt = next_payment_date + 1 dia`, `lib/referrals/apply-mp.ts`).
