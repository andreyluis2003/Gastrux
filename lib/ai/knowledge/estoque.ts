/** Knowledge: stock and purchases. */
export default `## Estoque e compras
Menu: Estoque e compras.
- Estoque: quantidade atual de cada insumo ativo; o insumo que nunca teve entrada aparece como "sem entrada ainda". As vendas dão baixa pelos insumos da ficha técnica.
- Entrada em lote (Estoque > botão Entrada em lote, só dono e gerente): lista todos os insumos; digita a quantidade que chegou e, se quiser, o custo por unidade de cada um, e confirma tudo de uma vez. Linhas em branco ficam de fora; o custo informado vira o custo do insumo. Tem o filtro "Só os abaixo do mínimo".
- Registrar entrada ou saída: um insumo por vez.
- Contagem (inventário): conferir o estoque físico e ajustar. Não confundir com a Contagem do dia (espetos), que fica em Vender.
- Compras: registrar compras de insumos. Importar nota de compra: lê o XML da NF-e do fornecedor e dá entrada no estoque.
- Desperdício: registrar perdas de insumos com motivo e custo.
- Fornecedores: cadastro dos fornecedores.
- Estoque baixo: insumos abaixo do estoque mínimo aparecem em alerta.`;
