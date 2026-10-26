# Venda por peso (padaria, fase 2)

Data: 2026-10-25. O dono pediu a fase 2 da padaria e disse "pode decidir tudo, começa direto": as
decisões abaixo são minhas (Claude) e ficam registradas aqui para ele conferir.

## Por quê

Padaria vende pão francês, frios, doces e salgados por kg. O Gastrux só vendia por unidade
(`quantity` inteiro em toda a venda), então a padaria tinha de inventar "pão 100 g" como item.

## O que entra

1. **Produto vendido por peso.** `MenuItem.soldByWeight` (padrão falso). O preço do item passa a ser o
   preço por kg; o cadastro mostra "Preço por kg" e o cardápio do caixa mostra "R$ 18,90/kg".
2. **Lançar com o peso digitado.** No Vender (comanda e balcão) e na Venda balcão rápida, tocar no item
   por peso abre "Peso": aceita "0,350" (kg), "0.35", "350 g" ou "350" (número inteiro acima de 50 é
   lido como gramas: ninguém vende 350 kg no balcão). Limite 1 g a 50 kg.
3. **A linha.** `OrderSessionItem.weightGrams` e `pricePerKg`; `quantity` fica 1 e `price` é o valor da
   linha: `round(preço por kg em centavos × gramas / 1000)`. Assim todo total que já existe (conta, PIX,
   caixa, DRE, cashback) continua certo sem mudar. A linha por peso nunca junta com outra, não aceita
   adicionais nem mudança de quantidade (peso errado: remove e lança de novo). Observação pode.
4. **Estoque e CMV.** A ficha técnica de um item por peso descreve **1 kg**. A baixa usa
   `gramas / 1000` no lugar da quantidade (fechamento da comanda, cozinha, cancelamento e retirada).
   O CMV e o consumo de insumos saem das movimentações, então ficam certos.
5. **Cozinha.** `OrderItem.weightGrams` é copiado no envio; o KDS e a via da cozinha mostram "0,350 kg".
6. **NFC-e.** Unidade `KG`, quantidade em kg (3 casas), valor unitário = preço por kg, valor do item =
   valor da linha.
7. **Telas e impressos.** Comanda, conta, pré-conta, cupom, via da cozinha e Relatórios › Vendas mostram
   "0,350 kg" no lugar de "1x". Em Vendas, a quantidade de um item por peso é a soma em kg.
   Engenharia de cardápio conta kg vendidos (o custo da ficha é por kg).
8. **Canais sem balança.** QR Code da mesa, site de delivery e robô do WhatsApp não oferecem item por
   peso (o cliente não tem como pesar); o servidor recusa um item por peso sem peso.
9. **Ajuda e IA.** Artigo de ajuda e conhecimento da IA explicam como cadastrar e vender por peso.

## Fora (vai para docs/pendencias.md)

- Balança ligada ao computador (serial/USB) e etiqueta da balança com código de barras (EAN-13 que
  começa com 2, com preço ou peso embutido) lida no caixa.
- Pedidos de plataformas (iFood, API de pedidos) com item por peso: chegam como unidade, como hoje.
- Contagem do dia (espetos) por peso.
