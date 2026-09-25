# Geração de post promocional por IA (a partir da receita)

## Contexto

Pesquisa de concorrentes (Saipos, Consumer, SisFood, GrandChef, e a Brendi
como achado lateral) mostrou que pelo menos um concorrente direto (Brendi)
vende "geração de banner promocional por IA" como feature do produto: o
dono do restaurante gera sozinho uma arte pronta pra postar no Instagram,
sem precisar de designer. A Consumer também usa visual gerado por IA (um
mascote-capivara) em parte do marketing dela, mas isso é interno à empresa,
não uma feature oferecida ao cliente.

Decisão de produto: o Gastrux ganha essa mesma capacidade, para o dono do
restaurante gerar uma arte promocional de um prato do cardápio em segundos,
sem precisar de designer nem de outra ferramenta.

## Escopo do V1 (decidido no brainstorm)

- Só **imagem estática** (banner/post). Vídeo curto fica para um projeto
  futuro separado — é uma integração técnica bem mais cara e complexa
  (provedor de vídeo IA é diferente de provedor de imagem) e não faz parte
  deste spec.
- Geração parte de um botão **dentro da página da receita** (Ficha
  Técnica), não de uma tela nova dedicada a "Marketing/Posts". Reduz a
  ceremônia de descoberta — encaixa numa tela que o dono já usa.
- A IA **nunca inventa a aparência do prato**. Se a receita não tem uma
  foto real vinculada, o fluxo pede para o usuário enviar uma foto antes de
  gerar. Motivo: modelos de geração de imagem por IA são ruins em comida
  fotorrealista e péssimos em renderizar texto/números com precisão — um
  preço errado ou um prato que não bate com o real é dano real para o
  cliente do restaurante, não só um detalhe estético.
- A única parte "IA" da geração é o texto (headline promocional). A
  composição visual (foto + preço + nome + logo) é um template server-side
  determinístico, não geração de imagem por difusão. Isso elimina o
  problema de preço ilegível/errado inteiramente, e usa infraestrutura que
  o Gastrux já tem (nenhum provedor de imagem novo é necessário no V1).

## Estado atual relevante (mapeado no código)

- `app/receitas/[id]/page.tsx` — página de detalhe da receita. Já tem
  `Preço de Venda`, e um cabeçalho de ações com **Editar** e **Desativar**
  (linhas ~264-283) onde o novo botão **Gerar post** entra.
- Fotos de prato hoje pertencem ao `MenuItem` (`MenuItemImage.imageUrl`),
  não à `Recipe` diretamente. Uma receita só tem foto real disponível se
  já existir um `MenuItem` vinculado (`MenuItem.recipeId`) com pelo menos
  uma `MenuItemImage`.
- `Restaurant.logoUrl` já existe (campo "URL do Logotipo" em
  Configurações) — usado como logo no template, quando presente.
- `lib/ai/llm-client.ts` (`callLLM`) — cliente já em uso (ex.: chat
  "Pergunte ao Gastrux") para o provedor de LLM via `ABACUSAI_API_KEY`.
  Será reaproveitado para gerar a headline. Nenhuma chave nova.
- `lib/s3.ts` — hoje só expõe upload via URL pré-assinada (fluxo
  client-side: o browser sobe o arquivo direto pro S3). A imagem gerada é
  produzida no servidor, então precisa de um envio direto por buffer — ver
  "Novo: `uploadBuffer`" abaixo.
- Next.js 14.2 (já na versão do projeto) inclui `ImageResponse` de
  `next/og` nativamente (baseado em Satori) — **nenhuma dependência nova**
  é necessária para renderizar a arte a partir de JSX/CSS para PNG.

## Fluxo

1. Na página da receita, o dono clica **Gerar post**.
2. Diálogo abre:
   - Se existe uma `MenuItemImage` para o `MenuItem` vinculado a essa
     receita, mostra essa foto como preview, já selecionada.
   - Se não existe, mostra um campo de upload (reaproveita
     `generatePresignedUploadUrl` de `lib/s3.ts`, mesmo padrão já usado em
     outros uploads de imagem do app) e bloqueia o botão "Gerar" até uma
     foto ser enviada.
3. Usuário confirma/edita:
   - **Preço a exibir** — pré-preenchido com `Recipe.sellingPrice`.
   - **Ocasião** — select fechado com 3 opções fixas: `Promoção`, `Prato
     do Dia`, `Novidade`. Não é campo de texto livre — mantém os templates
     visuais previsíveis (posição/tamanho de cada elemento já desenhados
     para essas 3 variações de "selo").
   - **Template** — 2 opções fixas no V1: `Quadrado (feed)` (1080×1080) e
     `Vertical (stories)` (1080×1920).
4. Usuário clica **Gerar**. O backend:
   a. Chama `callLLM` com um prompt curto (nome do prato + preço +
      ocasião) pedindo uma frase de chamada de até ~60 caracteres, em
      português, tom animado mas sem exagero. Se a chamada falhar ou
      estourar o tamanho esperado, usa um fallback determinístico: `"{nome
      do prato} — a partir de R$ {preço}"` (nunca bloqueia a geração por
      causa só do texto).
   b. Monta o JSX do template escolhido (foto de fundo, preço em destaque,
      nome do prato, headline, selo da ocasião, logo do restaurante se
      `logoUrl` existir) e chama `ImageResponse` para renderizar o PNG.
   c. Sobe o PNG para o S3 via a nova função `uploadBuffer` (ver abaixo) e
      grava um registro em `GeneratedPost` (ver "Novo modelo de dados").
   d. Retorna a URL pública da imagem.
5. Diálogo mostra a arte gerada com dois botões: **Baixar** (download
   direto do PNG) e **Gerar de novo** (repete o passo 4 — nova chamada de
   headline, possibilidade de sair um texto diferente; preço/foto/template
   continuam os mesmos escolhidos no passo 3, a menos que o usuário volte
   e mude algo).

## Novo modelo de dados

```prisma
model GeneratedPost {
  id           String   @id @default(cuid())
  restaurantId String
  recipeId     String
  imageUrl     String
  headline     String
  price        Decimal
  occasion     String   // 'PROMOCAO' | 'PRATO_DO_DIA' | 'NOVIDADE'
  template     String   // 'FEED_SQUARE' | 'STORIES_VERTICAL'
  createdAt    DateTime @default(now())
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  recipe       Recipe     @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([restaurantId])
  @@index([recipeId])
  @@map("generated_posts")
}
```

Serve só como histórico/auditoria no V1 — não existe tela de "galeria de
posts gerados" neste escopo. É o que permite, mais adiante, decidir com
dado real de uso (quantas gerações por restaurante, por mês) se algum dia
faz sentido um limite por plano. Nenhum limite é aplicado no V1: o único
custo variável por geração é uma chamada de LLM de texto curto (barata); a
renderização da imagem em si (`ImageResponse`) roda local, sem custo de
API externa.

## Novo: `uploadBuffer` em `lib/s3.ts`

```ts
export async function uploadBuffer(
  fileName: string,
  contentType: string,
  buffer: Buffer,
  isPublic: boolean = true
) {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    Body: buffer,
    ContentType: contentType,
  }));

  return { cloud_storage_path, url: await getFileUrl(cloud_storage_path, isPublic) };
}
```

Mesmo cliente/config que o resto de `lib/s3.ts` já usa — só adiciona o
caminho de envio direto por buffer (a geração roda no servidor, não faz
sentido gerar uma URL pré-assinada para o próprio servidor usar).

## Endpoint

`POST /api/receitas/[id]/gerar-post` — autenticado, escopado por
`restaurantId` (mesmo padrão de `getCurrentRestaurantId()` usado no resto
do app). Body: `{ price, occasion, template, menuItemImageId? |
uploadedImageUrl? }`. Retorna `{ imageUrl, headline }`.

## Tratamento de erro

- Sem foto real e sem upload: botão "Gerar" fica desabilitado no
  frontend; o endpoint também rejeita (400) se nenhuma imagem foi
  informada — nunca gera com prato "inventado".
- Falha do `callLLM`: fallback de texto determinístico (ver passo 4a) —
  nunca propaga erro pro usuário só por causa da headline.
- Falha no upload pro S3: erro 500 claro, diálogo mostra mensagem e
  permite tentar de novo (não perde o que o usuário já preencheu no
  formulário).
- `ImageResponse` falhar (ex.: JSX do template com problema): erro 500,
  mesmo tratamento acima.

## Testes

- Unitário: função que monta os dados de entrada do template (dado
  receita + preço + ocasião + headline, retorna as props corretas para
  cada um dos 2 templates) — não precisa testar o `ImageResponse` em si,
  é biblioteca do Next.js.
- Unitário: fallback de headline quando `callLLM` lança erro.
- Verificação manual (Browser pane): abrir uma receita com foto
  vinculada → Gerar post → conferir visualmente que preço e nome saem
  corretos na imagem final → testar o caminho sem foto (deve pedir
  upload, não gerar sem foto) → Baixar funciona.

## Fora de escopo (fica para depois, se fizer sentido)

- Geração de vídeo curto.
- Tela dedicada "Marketing/Posts" com galeria e agendamento de postagem
  direto pro Instagram/Facebook (publicação automática via Graph API).
- Limite de gerações por plano de assinatura.
- Fundo gerado por IA (Abordagem B do brainstorm) — mantido como
  evolução visual futura, não faz parte deste spec.
