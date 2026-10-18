/** Knowledge: bills to pay (spec 2026-10-18 contas-a-pagar). */
export default `## Contas a pagar
Menu: Caixa e pagamentos > Contas a pagar. Só dono e gerente.
- Uma lista só com todas as contas: aluguel, contador, impostos, folha, empréstimos, boletos de fornecedor e outras. Quadros no topo: Atrasadas, Vencem hoje, Próximos 7 dias e Total do mês.
- Nova conta: Uma vez, Parcelar (2 a 24 parcelas, a sobra de centavos vai na última) ou Repetir todo mês (plano Business: cria sozinha a conta do mês e dos 2 seguintes).
- Pagar: pelo banco (Pix, boleto, cartão, débito automático) ou pelo dinheiro da gaveta, que sai do caixa aberto como despesa ligada à conta. Desfazer pagamento pede motivo; se saiu da gaveta, o dinheiro volta para o caixa aberto.
- Editar uma conta que repete: "Só esta" ou "Esta e as próximas". Cancelar pede motivo e a conta fica no histórico.
- Contas de consumo com vencimento aparecem aqui sozinhas; valor e vencimento se editam em Contas de consumo.
- DRE pela competência (o mês a que a conta se refere): aluguel, impostos, serviços, empréstimos e outras entram na linha "Contas a pagar". Folha lançada aqui substitui a estimativa da Equipe. Compras de mercadoria ficam fora da DRE (o custo já está no CMV) e contas de consumo têm linha própria. Pagar pela gaveta não conta duas vezes.
- Plano Business: aviso às 7h no sino e por e-mail das contas que vencem hoje, das atrasadas e das que vencem em 3 dias; boletos da nota de compra (XML da NF-e) viram contas a pagar na importação.`;
