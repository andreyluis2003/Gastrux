/** Knowledge: cash shifts (spec 2026-10-04 caixa-turnos). */
export default `## Caixa (turnos)
Menu: Caixa e pagamentos > Caixa. Histórico em Caixa e pagamentos > Histórico de caixas (dono e gerente).
- Abrir o caixa: informe o troco inicial. Cada caixa (registradora) tem um turno aberto por vez.
- Durante o turno: as vendas pagas entram sozinhas, por forma de pagamento (Dinheiro, PIX, Crédito, Débito, Outros).
- Despesa: dinheiro que sai da gaveta para pagar algo (compras, entregador, outros). Entra como despesa na DRE.
- Sangria: dinheiro retirado da gaveta para guardar (cofre, banco). Não é despesa, não entra na DRE.
- Suprimento: dinheiro colocado na gaveta.
- Troco maior que o dinheiro que deveria haver na gaveta antes da venda (ex.: nota de R$ 100 logo após abrir com pouco troco): a venda é registrada e aparece um aviso para conferir o troco e, se faltar, lançar um suprimento. O aviso não mostra o valor esperado da gaveta (o caixa fecha às cegas).
- Fechar caixa: conte o que tem em cada forma; o Gastrux mostra o esperado e a diferença. Diferenças grandes geram aviso para o dono e o gerente, e pedem um motivo.
- Pagamentos feitos pelo celular na mesa (PIX ou cartão online) aparecem como "Recebido online": contam nas vendas do turno, mas não entram na gaveta.
- Entregadores (Caixa e pagamentos > Entregadores, dono e gerente): cadastro com nome, celular (opcional), diária e valor por entrega (opcionais; 0 = não paga) e ativo. Não se apaga: desativa. Nome único entre os ativos.
- Acerto do entregador (botão no Caixa, turno aberto): cada entregador tem duas partes. "Dinheiro dos pedidos": pedidos de delivery pagos na porta que saíram e não foram acertados; digite o dinheiro que ele trouxe, diferença vira ajuste com motivo obrigatório; dinheiro, cartão e vale entram no esperado do turno; não conta como venda de novo. "Pagamento": as entregas dos últimos 45 dias ainda não pagas a ele (na porta ou online, inclusive WhatsApp); valor calculado = diária por dia de trabalho + entregas × valor por entrega (ex.: 2 diárias × R$ 40,00 + 14 entregas × R$ 8,00 = R$ 192,00). O dia de trabalho vira às 05:00 e a diária nunca é paga duas vezes no mesmo dia. O caixa paga até o calculado; acima, só gerente. Entregador só com nome digitado: sem cálculo, teto = taxas de entrega. O pagamento sai como despesa "Entregador" em dinheiro e pode deixar o caixa negativo. Só contam entregas que saíram depois que a função foi ao ar. Entregas não pagas há mais de 45 dias saem do acerto (continuam no relatório). O troco que o entregador leva não precisa ser lançado.
- Relatório de entregadores (Relatórios): período (padrão mês atual), por entregador: entregas, diárias, total pago (o que saiu do caixa no período) e entregas ainda a pagar.
- Pagamentos online e estornos ficam em Caixa e pagamentos > Pagamentos online (dono e gerente).`;
