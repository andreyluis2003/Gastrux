# Foto do produto (cardápio)

Data: 2026-11-09. O dono perguntou como os clientes enviam fotos para o cardápio e os insumos. Hoje não enviam:
a tabela `MenuItemImage` existe e o cardápio digital (QR Code), o delivery e a lista do admin já mostram a primeira
foto, mas o formulário do produto não tem campo de foto e não há armazenamento de arquivos em uso (os pacotes
`@aws-sdk/client-s3` e `@azure/storage-blob` estão no `package.json` sem uso). A única foto possível vem do
"Importar de um link", que guarda o endereço original (some se a outra plataforma apagar). O dono pediu a proposta
da foto do produto com as escolhas que recomendei; as decisões abaixo são minhas (Claude) salvo onde está escrito
"dono".

## Para que serve

O dono do restaurante põe a foto de cada produto, tirada no celular ou escolhida do computador, e ela aparece no
cardápio do QR Code, no delivery e na lista do cardápio. Foto vende: é o que o cliente final vê antes de pedir.

**Medida de sucesso:** % de produtos com foto nos restaurantes ativos, 30 dias depois do lançamento.

## O que não é

- **Insumos ficam fora** (minha escolha): só a equipe os vê, a foto ajuda pouco ali.
- Não é galeria: **uma foto por produto**. Trocar a foto substitui a anterior.
- Não edita a imagem (recorte, filtro). Só diminui o tamanho antes de enviar.
- Não muda as fotos já importadas por link (ver "Depois").
- Não envia a foto para iFood ou 99Food.

## Como funciona

1. Em Cardápio e produtos › Cardápio digital, no formulário de **novo produto** e de **editar produto**, aparece a
   área **Foto**: um quadrado com a foto atual (ou um ícone de câmera) e os botões **Escolher foto** e, se já houver
   foto, **Remover**.
2. No celular, Escolher foto abre a câmera ou a galeria (`accept="image/*"`, sem forçar a câmera). No computador, abre
   o seletor de arquivos.
3. O navegador diminui a foto antes de enviar: lado maior com até 1200 px, formato JPEG, qualidade 0,8. Uma foto de
   celular de 4 MB vira algo como 150 a 300 KB. Aceita JPEG, PNG, WebP e HEIC quando o navegador consegue abrir
   (iPhone com Safari abre); se não conseguir, mostra "Não deu para abrir esta foto. Tente uma foto em JPG ou PNG."
4. A foto aparece no quadrado na hora, com "Enviando…"; ao terminar, fica salva no produto. No formulário de **novo**
   produto, a foto é enviada depois que o produto é criado (o produto precisa existir).
5. Quem pode: os mesmos que podem alterar o cardápio (`MANAGER_ROLES`, "Alterar o cardápio exige um gerente").
6. Todos os planos.

## Onde as fotos ficam

Num armazenamento de arquivos compatível com S3, usando o `@aws-sdk/client-s3` que já está no projeto.
**Recomendo o Cloudflare R2** (sem taxa de saída, 10 GB grátis; nesse volume, custo praticamente zero). Funciona
igual com Amazon S3 ou outro compatível. A escolha do serviço e a criação da conta são do **dono**; as chaves vão
nas variáveis de ambiente do Easypanel, **nunca no chat**:

- `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION` (R2: `auto`), `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`,
  `STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_URL` (endereço público do bucket ou domínio próprio, ex.
  `https://fotos.gastrux.com`), `STORAGE_PREFIX` (`app` na produção, `homolog` no homolog, para não misturar).
- Caminho do arquivo: `<prefixo>/restaurants/<restaurantId>/menu/<menuItemId>/<id aleatório>.jpg`. O caminho vai em
  `MenuItemImage.cloudStoragePath`; o endereço público em `imageUrl`. Nome aleatório para o navegador não mostrar a
  foto antiga do cache depois de uma troca.
- Trocar ou remover a foto apaga o arquivo antigo; apagar o produto também (se o apagar falhar, só registra no log:
  um arquivo esquecido não quebra nada).
- **Sem as variáveis configuradas**, a área Foto mostra "Envio de fotos ainda não está disponível" e o resto do
  formulário funciona como hoje.

Guardar no disco do próprio servidor foi descartado: as fotos podem se perder numa troca de servidor ou num novo
deploy sem volume.

## Regras do envio (servidor)

- Rota que recebe o arquivo (`multipart/form-data`), confere a sessão, o papel e que o produto é do restaurante
  atual.
- Aceita só `image/jpeg`, `image/png`, `image/webp`, conferindo os primeiros bytes do arquivo, não só o tipo
  declarado. Máximo de **2 MB** depois de diminuída (o navegador já mandou pequena; o limite protege contra envio
  direto).
- Responde com a foto salva (`{ id, imageUrl }`). Erro de armazenamento: "Não foi possível salvar a foto. Tente de
  novo." e nada muda no produto.
- Um produto com foto importada por link que recebe foto enviada: a enviada substitui a importada (a do link não tem
  arquivo para apagar, `cloudStoragePath` vazio).

## Textos para o cliente e a IA (regra do projeto)

- `lib/ai/knowledge/cardapio.ts`: como pôr, trocar e remover a foto do produto, tamanho, quem pode; corrigir a menção
  atual a "fotos" no Cardápio digital para descrever o que existe de fato. Deixar claro que insumos não têm foto.
- `lib/help/seed-articles.ts`: artigo "Como colocar foto nos produtos" (com o hash antigo, como manda a regra).
- O manual de operação (Claude Doc) ganha o parágrafo do armazenamento: serviço, variáveis, prefixo por ambiente.

## Sem mudança

- Tabela `MenuItemImage`: já tem `imageUrl` e `cloudStoragePath`. **Sem migração.**
- Cardápio do QR Code, delivery e lista do admin já mostram `images[0]`. Com `images: { unoptimized: true }` no
  `next.config`, um domínio novo de foto não precisa de configuração.

## Deploy

1. O dono cria a conta e o bucket (R2 recomendado), com acesso público de leitura, e as chaves de escrita.
2. Põe as variáveis no Easypanel (homolog com `STORAGE_PREFIX=homolog`, app com `app`).
3. Deploy (homolog, depois app). Sem migração.

O código pode ir para a main antes das chaves existirem: sem elas, aparece o aviso de "ainda não disponível".

## Testes

- Unidade: conferência do tipo pelos primeiros bytes; limite de 2 MB; montagem do caminho e do endereço público;
  aviso quando as variáveis faltam.
- Integração (armazenamento simulado): enviar foto salva o arquivo e o `MenuItemImage`; trocar apaga o arquivo antigo;
  remover apaga arquivo e linha; produto de outro restaurante é recusado; garçom é recusado; arquivo que não é imagem
  é recusado; foto importada por link é substituída sem tentar apagar arquivo.
- Tela: foto aparece no formulário, na lista, no cardápio do QR Code e no delivery; teste no celular (Android e
  iPhone) tirando foto pela câmera.
- Teste real: o dono põe a foto de um produto no homolog e confere no cardápio do QR Code.

## Fica para o builder

- Nome das rotas e dos arquivos; se a diminuição usa `canvas` puro ou um pacote pequeno.
- O visual exato da área Foto, seguindo o formulário atual.

## Depois (não faz parte desta)

- "Importar de um link" passar a **copiar** as fotos para o armazenamento, em vez de guardar o endereço original
  (resolve o risco de sumirem). Exige baixar imagens de sites de fora com cuidado (só https, só imagem, limite de
  tamanho e tempo).
- Foto nos insumos, se algum cliente pedir.
- Foto do produto nas integrações (iFood, 99Food), quando o cardápio for sincronizado com elas.
