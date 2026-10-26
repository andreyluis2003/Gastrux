# Revisão da lanchonete: combos na contagem do dia e cardápio de exemplo

Data: 2026-10-26. O dono pediu "faz a revisão da lanchonete" (backlog de 2026-10-23: cardápio de exemplo melhor,
combos, salgados por unidade e por cento). As decisões abaixo são minhas (Claude), como nas fases da padaria.

## O que a revisão achou

- **Combo quebra a contagem do dia.** Um combo hoje é um item do cardápio com a própria ficha técnica (os
  insumos do lanche e da bebida somados): o estoque e o custo saem certos. Mas a contagem do dia conta vendas
  por ficha: "Combo coxinha + refri" não conta como coxinha vendida, e no fim do dia a coxinha aparece como
  "faltam". O mesmo vale para o "cento de salgados" de uma festa e para um combo de espetos na espetaria.
- **Combos fantasmas no QR.** O cardápio da mesa (QR) mostra "Combos Especiais" vindos de sugestões antigas da
  IA (tipo COMBO_SUGGESTION, código do Abacus). Nada cria essas sugestões desde que a tela foi removida em
  23/10, e o cliente não consegue pedir esses combos. Sai.
- **Modelo de lanchonete pobre.** Seis itens, sem combo, sem salgado de festa, refrigerante sem estoque.

## Decisões

1. **"Na contagem do dia, conta como"** (tabela nova `RecipeCountPart`: ficha, ficha contada, quantidade
   inteira). Na edição da ficha técnica de um item que não é contado, o dono escolhe quais itens da contagem
   ele leva e quantos: "Combo coxinha + refri" conta como 1 Coxinha; um "Cento de coxinhas" contaria 100.
   - Só fichas marcadas para a contagem podem ser parte; uma ficha contada não pode ter partes (sem ciclos);
     até 10 partes, de 1 a 1.000 cada.
   - O vendido da contagem soma as vendas da própria ficha mais as vendas de cada ficha que a leva × a
     quantidade (comandas e pedidos sem comanda, mesmas regras de hoje: canceladas e encomendas não contam).
   - Combo cancelado na cozinha vira perda das partes, como um espeto cancelado.
   - Estoque, custo, CMV e DRE não mudam: continuam pela ficha do próprio combo.
2. **QR sem "Combos Especiais".** Sai a consulta e a seção. Combo é um item comum numa categoria "Combos".
3. **Modelo de lanchonete novo:** Lanches (misto quente, bauru, X-salada, pão na chapa, pão com ovo), Salgados
   (coxinha, kibe, esfiha, contados no dia), Para festas (cento de salgados fritos, para Encomendas),
   Combos (misto + suco, coxinha + refri, café da manhã), Bebidas (suco, café com leite; refrigerante com
   insumo próprio, para ter estoque). O combo com coxinha já vem com "conta como". O cento do exemplo é de
   salgadinhos de festa (outro insumo, feitos para a encomenda), por isso não conta na contagem.

## Fora

- Combo com escolha (suco OU refri) e montar a ficha do combo a partir das fichas dos itens: o dono soma os
  insumos na ficha, como hoje. Vai para docs/pendencias.md.
