# Vídeos tutoriais (onboarding em vídeo) — design

**Pedido do dono (2026-10-25):** vídeos de onboarding com o passo a passo de cada item do painel,
e um lugar no sistema com todos eles, para o cliente aprender a usar tudo sozinho, sem ninguém
precisar ensinar. O dono pulou as perguntas ("pode fazer direto"): as decisões abaixo são minhas
e estão marcadas como tal.

## Objetivo e porquê

- O cliente novo aprende cada tela sozinho, no momento em que precisa dela.
- Menos suporte humano: a resposta para "como faço X?" é um vídeo de 1 a 2 minutos daquela tela.
- Anti-objetivos: vídeo que mostra tela que não existe ou se comporta diferente do sistema real;
  vídeo longo e genérico; área de vídeos que ninguém acha.

## Onde os vídeos aparecem (decisão minha)

1. **Página "Vídeos tutoriais" (`/tutoriais`)**, dentro do sistema, para todos os papéis:
   - trilha **"Comece por aqui"** (os essenciais, na ordem de implantação), com progresso
     ("3 de 8 assistidos");
   - depois todos os vídeos agrupados pelos mesmos grupos do menu (Vender, Caixa e pagamentos...);
   - busca por título;
   - cada usuário só vê os vídeos das telas que o papel dele acessa (mesma regra do menu, `navFor`).
2. **Página de cada vídeo (`/tutoriais/[slug]`)**: player, o passo a passo escrito embaixo (o mesmo
   roteiro da narração), botão "Abrir esta tela" e "Próximo vídeo". Marca como assistido ao chegar a
   90% ou no fim.
3. **Botão "Vídeo desta tela"** no menu lateral (computador) e na barra de cima (celular), só quando
   a tela atual tem vídeo. Abre o vídeo numa janela por cima, sem sair da tela.
4. **Link fixo "Vídeos tutoriais"** no rodapé do menu, ao lado de "Central de ajuda".
5. **"Primeiros passos" do painel**: cada passo ganha "▶ Ver vídeo" quando há vídeo para ele.
6. **Central de ajuda e IA**: artigo "Vídeos tutoriais" em Primeiros passos, e a IA sabe indicar o
   vídeo de cada tela (knowledge + o catálogo).

Vídeo ainda não produzido não aparece (sem "em breve").

## Catálogo (fonte única)

`lib/tutorials/catalog.ts`: `TUTORIALS: Tutorial[]` com `slug`, `title`, `group` (id do grupo do
menu), `routes` (telas onde o botão aparece; a primeira é a do "Abrir esta tela"), `summary`,
`steps` (o passo a passo escrito), `durationSec`, `essentialOrder?` (posição na trilha) e
`published` (o arquivo existe). URL do vídeo: `${NEXT_PUBLIC_TUTORIAL_VIDEO_BASE ?? '/videos/tutoriais'}/${slug}.mp4`
e capa `.jpg` — trocar para um CDN depois é só a variável.

## Progresso (decisão minha)

Tabela nova `TutorialView (userId, slug, watchedAt)`, única por (userId, slug): o progresso segue o
usuário em qualquer aparelho. APIs `GET/POST /api/tutorials/progress`. Precisa de
`npx prisma migrate deploy` em produção.

## Como cada vídeo é feito (decisão minha)

Projeto `C:\Users\andre\gastrux-videos`, pasta `tutoriais/`:

1. **Roteiro** por vídeo: lista de passos, cada um com a fala e as ações na tela.
2. **Narração** (ElevenLabs, plano Criador, voz Marcos Alves): um áudio por vídeo, um parágrafo por
   passo; o tempo de cada passo vem das pausas (ou da transcrição).
3. **Gravação** com Playwright no sistema real (build local com o restaurante de demonstração
   "Espetaria Brasa Viva", banco de teste), 1920x1080, com um cursor desenhado que se move até o
   alvo antes de cada clique. O gravador anota o início de cada passo e a posição de cada clique.
4. **Montagem** no Remotion: abertura com o chef e o título (2,5 s); cada passo é o trecho gravado
   ajustado ao tempo da fala (acelera, desacelera ou congela o último quadro); legenda embaixo; selo
   "Passo 2 de 5"; zoom suave e anel no ponto do clique; encerramento com o chef e "Próximo vídeo".
   Fundo verde-escuro liso da marca (o dono não quis foto de fundo).
5. **Saída**: MP4 1280x720 (leve, começa rápido) + capa JPG em
   `gastrux-espetaria/public/videos/tutoriais/`.

Regras: só mostrar o que a tela faz hoje; dados fictícios da demonstração; nenhuma credencial
real na tela; textos em português do Brasil com números no formato brasileiro.

## Lista de vídeos (um por item do menu; itens muito pequenos juntos)

Trilha "Comece por aqui" (essenciais, nesta ordem):

| # | slug | Título | Telas |
|---|------|--------|-------|
| 1 | conhecendo-o-painel | Conhecendo o painel | /dashboard |
| 2 | insumos | Cadastrando insumos | /insumos |
| 3 | fichas-tecnicas | Fichas técnicas e custo do prato | /receitas |
| 4 | cardapio-digital | Produtos e cardápio | /admin/cardapio |
| 5 | cadastro-de-mesas | Cadastrando as mesas | /admin/tables |
| 6 | caixa | Abrindo e fechando o caixa | /caixa, /caixa/historico |
| 7 | mesas-e-balcao | Vendendo: mesas, comanda e balcão | /vender, /comanda |
| 8 | cozinha-kds | A tela da cozinha | /cozinha |
| 9 | equipe-e-acessos | Equipe e acessos | /admin/staff |

Demais (por grupo do menu):

- **Vender:** pedidos-de-delivery (/admin/integrations/orders), contagem-do-dia (/contagem-do-dia)
- **Caixa e pagamentos:** pagamentos-online (/dashboard/pagamentos), contas-a-pagar (/contas-a-pagar)
- **Cardápio e produtos:** adicionais (/admin/modifiers), qr-codes-das-mesas (/admin/tables/qrcodes)
- **Estoque e compras:** estoque (/estoque), contagem-de-estoque (/contagem), compras (/compras),
  desperdicio (/desperdicio), fornecedores (/fornecedores), importar-nota-de-compra (/admin/nfe-import)
- **Fiscal:** nfce (/admin/fiscal), notas-emitidas (/admin/nfe/documents)
- **Relatórios:** cmv (/cmv), consumo-de-insumos (/consumo-analise), vendas (/dashboard/reports/sales),
  lucratividade (/dashboard/reports/profitability), financeiro (/dashboard/financeiro,
  /dashboard/financeiro/contas), relatorio-executivo (/relatorios)
- **Clientes e marketing:** clientes-crm (/dashboard/crm), cashback (/admin/cashback),
  campanhas (/admin/messaging/campaigns), site-de-delivery (/admin/delivery-site)
- **Mais recursos:** planejamento-de-producao (/planejamento), escalonar-receita (/escalonamento),
  etiquetas-e-validades (/etiquetas, /etiquetas/validades), engenharia-de-cardapio
  (/engenharia-cardapio), dre (/dashboard/financeiro/dre), turnos (/admin/staff/shifts),
  comissoes (/admin/staff/commissions)
- **Configurações:** configuracoes-do-restaurante (/admin/settings), minha-assinatura
  (/dashboard/billing), whatsapp (/admin/integrations/whatsapp), api-de-pedidos
  (/admin/integrations/api), varias-lojas (/admin/multi-location), uso-da-ia (/admin/settings/ia)
- **Fica de fora por enquanto:** iFood (ainda em homologação; entra quando liberar).

Total: 46 vídeos (9 da trilha + 37).

## Entregas em lotes

1. **Lote 1:** a área de vídeos no sistema (tudo da seção "Onde aparecem"), a linha de produção, e
   os 9 vídeos da trilha "Comece por aqui". O dono assiste e aprova o formato antes do resto.
2. **Lote 2:** Vender, Caixa e pagamentos, Cardápio e produtos, Estoque e compras.
3. **Lote 3:** Fiscal, Relatórios.
4. **Lote 4:** Clientes e marketing, Mais recursos, Configurações.

## Fica para quem constrói

Layout das páginas no padrão visual do sistema; texto exato das falas (curto, direto, "você");
a ordem dos passos dentro de cada vídeo segue o uso real da tela.
