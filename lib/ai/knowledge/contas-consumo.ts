/** Knowledge: utility bills (spec 2026-10-16 contas-de-consumo). */
export default `## Contas de consumo
Menu: Relatórios > Contas de consumo. Só dono e gerente.
- Contas: Energia (R$ e kWh), Água (R$ e m³), Gás encanado (R$ e m³), Gás P13 e Gás P45 (R$ e número de botijões), Telefone/Internet (só R$) e Outra conta com nome livre, como aluguel e condomínio (só R$).
- Lançar conta: escolha o mês de referência (o padrão é o mês anterior), o valor e o consumo como estão na conta. O valor aceita "1.240" e "1.240,00". Uma conta por mês; lançar de novo o mesmo mês corrige.
- Entra na DRE pelo mês de referência, na linha "Contas de consumo", em todos os planos.
- No plano Pro: comparação com o mês anterior, com a média de 3 meses e com o mesmo mês do ano anterior, preço por kWh ou m³, % do faturamento e barras no histórico.
- Aviso no sino (Pro): consumo 20% acima da média dos meses anteriores (precisa de 2 meses). Só para os últimos 3 meses e uma vez por conta e mês.
- Desativar uma conta tira ela da lista, mas guarda o histórico; dá para reativar.`;
