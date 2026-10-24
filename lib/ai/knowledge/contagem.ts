/** Knowledge: daily count / espetos (spec 2026-10-16 contagem-espetos). */
export default `## Contagem do dia (contagem de espetos)
Menu: Vender > Contagem do dia. Em espetarias o título é "Contagem de espetos". Todos os planos.
- Serve para o que é preparado antes de vender (espetos, salgados). Vale para os itens com "Contar na contagem do dia" ligado na ficha técnica; nos cardápios de exemplo já vêm ligados os espetos e o pão de alho (espetaria), os salgados (lanchonete), as marmitas (marmitaria) e os doces e fatias de bolo (doceria). Restaurante, pizzaria, hamburgueria, japonês, açaí e bar fazem na hora: ligue nos itens que você prepara antes.
- Uma noite vai de um fechamento ao próximo. Para cada item: Deveria ter = início + montados - vendidos - perdas.
- Montados: botões +1, +10, +20 ou "Outro valor", a qualquer hora.
- Perda: botão Perda, com motivo (Caiu, Queimou, Venceu, Outro). Espeto cancelado depois de a cozinha começar (pedido cancelado ou item tirado da comanda) entra sozinho como perda "Cancelado na cozinha".
- Vendidos entram sozinhos: comandas, venda de balcão, QR, WhatsApp e delivery do site. iFood e Keeta só entram pela integração ou se forem lançados no Gastrux.
- Desfazer: quem lançou desfaz em até 2 minutos; depois só gerente ou dono.
- Fechar contagem: só dono e gerente. Conte a sobra de cada item; a tela mostra "faltam" em vermelho e "a mais" em amarelo. A sobra contada vira o início da noite seguinte e não pode ser apagada.
- Na primeira noite, use "Lançar o início" para dizer quantos já tem na geladeira.
- Histórico: noites fechadas e totais por item das últimas 4 semanas. No Business, a falta gera aviso no sino com o valor em R$.
- A validade dos espetos fica com as Etiquetas (controle de validades do Business).`;
