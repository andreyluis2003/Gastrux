/** Knowledge: cashback and CRM by phone (spec docs/superpowers/specs/2026-10-23-cashback-design.md). */
export default `## Cashback e clientes
- Cashback: o cliente ganha um crédito em reais a cada compra e usa como desconto numa próxima conta. Plano Business (e teste de 30 dias). A antiga tela Fidelidade (pontos, recompensas, marcos) não existe mais.
- Regra em Clientes e marketing > Cashback (dono e gerente): percentual (padrão 5%, de 0,5% a 30%), validade (padrão 6 meses, de 1 a 24), mínimo para usar (padrão R$ 10), ligar/desligar. A tela mostra creditado e usado no mês, saldo dos clientes, o que vence em 30 dias e as últimas movimentações.
- Base do crédito: valor dos itens pagos; sem taxa de serviço, sem taxa de entrega e sem o cashback usado. Arredonda para baixo no centavo.
- Na conta (Vender): campo "Celular do cliente (cashback)"; celular novo pede o nome. Com saldo a partir do mínimo aparece "Usar cashback (R$ X)", que abate até o que falta pagar (pode tirar antes de pagar). Ao fechar, credita e o cupom mostra quanto o cliente ganhou.
- Venda balcão: tem o celular; ganha crédito, não usa. Feita sem internet, credita quando chegar ao servidor.
- Site de delivery: o cliente é reconhecido pelo celular do pedido e ganha crédito quando o pedido é concluído; o saldo ainda não é usado no site.
- O crédito mais antigo é usado primeiro; vencido sai do saldo. Reabrir ou cancelar a conta desfaz o crédito dela e devolve o cashback que ela usou.
- DRE: o cashback usado entra em Deduções como "Cashback usado" (a receita bruta soma o valor cheio). A NFC-e sai com o desconto repartido entre os itens.
- Clientes (CRM): busca por nome, celular ou e-mail; cadastro sem e-mail; total gasto, compras, ticket médio, segmento e, no Business, saldo e extrato do cashback. Segmento pelas compras dos últimos 90 dias: VIP com 10 ou mais, Regular de 3 a 9, Ocasional 1 ou 2, Inativo sem compra. No Pro o celular na conta já soma as compras no CRM.`;
