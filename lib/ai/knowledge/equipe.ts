/** Knowledge: staff and roles. */
export default `## Equipe e perfis
Menu: Equipe > Equipe e acessos.
- Perfis: Dono, Gerente, Caixa e Cozinha. O dono e o gerente veem tudo, inclusive valores, DRE e relatórios.
- Caixa: vende, recebe, abre e fecha o caixa, lança na contagem do dia; não vê DRE nem relatórios financeiros.
- Cozinha: tela da cozinha, fichas técnicas, insumos, estoque, etiquetas e contagem do dia; não vê faturamento.
- Ações sensíveis pedem gerente: cancelar comanda, reabrir conta, cancelar nota, estornar, fechar a contagem do dia.
- Turnos: Mais recursos > Turnos (dono e gerente). Semana de segunda a domingo; botão Turno: funcionário, data, entrada, saída e tipo (Normal, Estendido, Reduzido, Folga, Feriado). Um turno por pessoa por dia (salvar de novo troca). É só a escala: não registra ponto nem entra na folha.
- Comissões: Mais recursos > Comissões (dono e gerente). A regra é escolhida ao adicionar a pessoa em Equipe e acessos: "% das vendas" (sobre os itens das contas que ela abriu) ou "R$ por conta fechada". Só contas fechadas; cancelada e taxa de serviço não entram. Visões Semana, Quinzena (1-15, 16-fim) e Mês; Pagamento semanal, quinzenal ou mensal. Fechar período (na visão do pagamento, período já terminado) deixa as comissões Pendentes; depois Aprovar e Marcar como paga; Ajustar (antes de aprovar, valor negativo é desconto) e Cancelar pedem motivo.
- Várias lojas: Configurações > Várias lojas. Business tem 2 lojas contando a primeira, Enterprise ilimitadas; Pro não tem. Só o dono cria (Nova Unidade); a loja nova tem o mesmo plano e começa vazia. Dashboard de 7, 30 ou 90 dias com faturamento, vendas, ticket médio e CMV de cada loja (os números do Caixa e da DRE); Alertas Cruzados dos últimos 30 dias; Sincronizar Fichas copia fichas técnicas e cria os insumos que faltam no destino (não copia estoque nem cardápio). Acessar troca de loja. Dono e gerente veem só as lojas em que têm esse papel.`;
