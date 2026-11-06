# Importar o cardápio por link (2026-11-06)

Item 3 da comparação com o Anota AI (memória "Gastrux vs Anota AI"). O dono disse "pode decidir": as decisões
abaixo são minhas, salvo onde está escrito "dono".

## Por quê

Cadastrar o cardápio é o passo mais longo do primeiro acesso (10 min no guia, muitas vezes bem mais). O restaurante
que chega ao Gastrux quase sempre já tem o cardápio publicado em outra plataforma de pedidos. Colar o link e trazer
categorias, produtos, preços, fotos e adicionais tira esse trabalho.

## O que se viu (recon 2026-11-06)

- Link do dono: `madoburger.com.br/shoppingsinop/pedidos`, plataforma **Zé Pediu** (white label da LigaFiles,
  "alloy"). A página traz `window.__INITIAL_DATA__` com `catalogo.categorias[id].itens[id]`: nome, descrição,
  preço, preço promocional, foto (`foto_principal`, muitas hospedadas no CDN do iFood), `cod_pdv`, status e
  `categorias_complementos` (grupos com nome, obrigatório, mín/máx e opções com preço). 5 categorias, 35 itens.
- **iFood**: `www.ifood.com.br` responde 403 com desafio anti-robô (Cloudflare). **Não contornar.** O iFood fica
  fora do link; a tela orienta mandar um print ou PDF do cardápio para a IA (cardápio por foto, já existe).
- **Anota AI**: a loja é um app Vue sem dados na página; o cardápio vem de uma API privada. Fora por enquanto
  (mesma orientação do iFood).
- Genérico: páginas com JSON-LD schema.org `Menu` (`hasMenuSection` / `hasMenuItem` / `offers.price`).

## Decisões

1. **Fontes na v1:** Zé Pediu (e qualquer loja da mesma plataforma, reconhecida pelo `__INITIAL_DATA__` com
   `catalogo.categorias`) e JSON-LD `Menu` genérico. iFood, Anota AI e páginas sem cardápio legível: mensagem
   clara mandando para o cardápio por foto com a IA. Nada de contornar bloqueio de site.
2. **Onde:** Cardápio e produtos > Cardápio digital, botão **Importar de um link**. Dono, gerente e ADMIN.
   Todos os planos (é ajuda de implantação).
3. **Fluxo:** colar o link → **Ler cardápio** (o servidor busca a página, nada é gravado) → prévia por categoria,
   cada item com caixa marcada, foto pequena, preço original e preço ajustado → opções → **Importar N produtos**.
4. **Ajuste de preço:** campo "Ajustar os preços em %" (−50 a +50, padrão 0), arredondado ao centavo. Serve para o
   delivery próprio ficar mais barato que o app (ex.: −10%).
5. **Preço:** o preço cheio (`preco`), não o promocional. A promoção da outra plataforma não vira preço fixo.
6. **Fotos:** caixa "Trazer as fotos" (marcada). O Gastrux não tem armazenamento de arquivos hoje: a foto entra como
   o endereço original (`MenuItemImage.imageUrl`, `cloudStoragePath` vazio). Risco aceito e escrito na ajuda: se a
   outra plataforma apagar a foto, ela some aqui. Só endereços `https`.
7. **Código PDV:** quando o item tem `cod_pdv`, vira o **Código do produto** (ajuda o iFood a reconhecer o item).
   Código já usado no restaurante ou repetido na importação: o item entra sem código.
8. **Adicionais:** caixa "Trazer os adicionais (N)". Os adicionais do Gastrux são uma lista única do restaurante
   (nome, grupo, preço), sem ligação com o produto e sem obrigatório/mín/máx. Cada opção vira um adicional com
   `category` = nome do grupo, sem repetir nome + grupo que já existe. A prévia avisa que "obrigatório" e
   "escolha até N" não passam para o Gastrux.
9. **Itens que já existem** (mesmo nome, sem acento e maiúsculas): pulados, como no cardápio por foto. Itens
   indisponíveis na origem entram desmarcados.
10. **Cardápio de exemplo:** a mesma caixa "Tirar o cardápio de exemplo" do cardápio por foto, marcada quando a conta
    ainda tem o exemplo.
11. **Ficha simples:** cada produto criado ganha a ficha simples (`ensureMenuItemRecipes`), como em todo o Gastrux.
12. **Direito de uso:** caixa obrigatória "Este cardápio é do meu restaurante". O importador é para trazer o próprio
    cardápio, não o do concorrente.
13. **Segurança da busca:** só `https` público (mesma regra do aviso de status da API de pedidos: IP checado e a
    conexão presa a ele, sem rede interna), até 3 redirecionamentos (cada um checado de novo), 10 s, 5 MB. O
    servidor nunca devolve o HTML, só o cardápio lido. Limite de 20 leituras por hora por restaurante.
14. **Gravação:** uma transação; até 300 itens; a resposta diz quantos entraram, quais foram pulados e quantos
    adicionais. Registro em auditoria.
15. **Sem modelo novo no banco** (nenhuma migração).

## Fora

- iFood e Anota AI por link; copiar os horários e a taxa de entrega; ligar adicional a produto; promoções; baixar as
  fotos para um armazenamento próprio (anotar em pendências).

## Junto (regra da casa)

Artigo de ajuda novo (Cardápio), base da IA (`lib/ai/knowledge`), manual (Claude Doc), pendências.
