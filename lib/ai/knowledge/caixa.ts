/** Knowledge: cash shifts (spec 2026-10-04 caixa-turnos). */
export default `## Caixa (turnos)
Menu: Caixa e pagamentos > Caixa. Histórico em Caixa e pagamentos > Histórico de caixas (dono e gerente).
- Abrir o caixa: informe o troco inicial. Cada caixa (registradora) tem um turno aberto por vez.
- Durante o turno: as vendas pagas entram sozinhas, por forma de pagamento (Dinheiro, PIX, Crédito, Débito, Outros).
- Despesa: dinheiro que sai da gaveta para pagar algo (compras, entregador, outros). Entra como despesa na DRE.
- Sangria: dinheiro retirado da gaveta para guardar (cofre, banco). Não é despesa, não entra na DRE.
- Suprimento: dinheiro colocado na gaveta.
- Fechar caixa: conte o que tem em cada forma; o Gastrux mostra o esperado e a diferença. Diferenças grandes geram aviso para o dono e o gerente, e pedem um motivo.
- Pagamentos feitos pelo celular na mesa (PIX ou cartão online) aparecem como "Recebido online": contam nas vendas do turno, mas não entram na gaveta.
- Pagamentos online e estornos ficam em Caixa e pagamentos > Pagamentos online (dono e gerente).`;
