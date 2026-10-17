/** Knowledge for "Pergunte ao Gastrux": selling (spec 2026-10-07 tela-vender). Keep updated with every change. */
export default `## Vender (mesas, balcão e comandas)
Menu: Vender > Mesas e balcão.
- A tela mostra o mapa das mesas (Livre, Ocupada, Em manutenção) e o balcão. Tocar numa mesa livre abre a comanda dela; se ninguém lançar nada e você voltar, a mesa fica livre de novo.
- Para lançar itens: abra a mesa, toque nos itens do cardápio (cada toque soma 1) e use "Enviar para a cozinha". Só os itens novos são enviados.
- Observação no item (por exemplo "sem cebola") vai junto para a cozinha.
- Conta: mostra subtotal, taxa de serviço (10%, o cliente pode recusar), o que já foi pago e o que falta. Dá para imprimir a pré-conta, receber em várias formas de pagamento e dividir.
- Transferir e juntar: dá para mover itens de uma comanda para outra e juntar mesas.
- Remover um item já enviado pede um motivo; a cozinha recebe o item como CANCELADO.
- Cancelar a comanda inteira: menu de opções da comanda > Cancelar comanda, só gerente ou dono, com motivo. Não funciona se a cozinha ainda tem pedido em aberto dessa comanda.
- Reabrir uma conta já fechada: botão "Reabrir conta", só gerente ou dono, com motivo; o dinheiro volta do caixa.
- Venda de balcão: vende e recebe na hora. A opção "Enviar para a cozinha" vem desmarcada; marque quando o item precisar ser preparado.
- Mesas: o cadastro fica em Vender > Mesas (número, setor, manutenção). Os QR Codes de cada mesa ficam em Cardápio e produtos > QR Codes das mesas.
- Cozinha (KDS): Vender > Cozinha (KDS) mostra os pedidos por estação. O Starter tem 1 estação, o Pro até 3 e o Business ilimitadas.
- Pedidos de delivery do site aparecem em Vender > Pedidos de delivery.`;
