# Agente: resposta sugerida nas Conversas (etapa 1)

Data: 2026-11-09. O número oficial +55 34 99297-0022 passou a receber mensagens hoje (a WABA 1101798518937750
foi inscrita no app Gastrux; teste de ida e volta confirmado pelo dono). Hoje, quando um cliente escreve, a
mensagem fica em Plataforma › Fila do agente › Conversas, o sino toca e alguém da equipe digita a resposta. O dono
perguntou se precisava de outro agente para atender esse número. Decisão: **é o mesmo agente** (o de ativação,
spec 2026-10-27), que passa a **sugerir** a resposta. O dono pediu para pular as perguntas: as decisões abaixo são
minhas (Claude).

## Para que serve

Responder rápido e certo quem escreve para o 0022, sem a equipe ter de redigir cada resposta. O WhatsApp só deixa
mandar texto livre até 24 horas depois da última mensagem do cliente; depois disso, só modelo aprovado. Uma
resposta já pronta na tela encurta esse caminho.

**Medida de sucesso:** % de sugestões enviadas sem mudança ou com pouca edição, e tempo entre a mensagem do
cliente e a resposta. Depois de 2 a 3 semanas, com 70% ou mais das sugestões enviadas como estão (ou quase), a
etapa 2 (resposta automática para perguntas simples) entra em discussão.

## O que não é

- **Não envia nada sozinho.** Toda resposta passa por um clique de alguém da equipe em Responder.
- Não é um agente novo nem um robô separado: usa o mesmo conhecimento da IA do Gastrux e o mesmo lugar
  (Conversas).
- Não atende o 0141 (número dos anúncios, no aplicativo do celular) nem o robô de pedidos dos restaurantes.
- Não mexe em dinheiro: não oferece desconto, mais dias de teste, cancelamento nem cobrança (mesma regra do agente
  de ativação).

## Como funciona

1. O cliente escreve para o 0022. O webhook guarda a mensagem como hoje (`handleInbound`), e o sino toca.
2. Quando alguém da equipe abre a conversa, e a última mensagem é do cliente, com a janela de 24 horas aberta, o
   Gastrux pede uma sugestão à IA e mostra a resposta **já dentro da caixa de texto**, com o selo "Sugestão do
   agente".
3. A pessoa lê, edita se quiser, e clica em **Responder** (o envio atual, sem mudança). Ou clica em **Nova
   sugestão** (pede outra) ou **Descartar** (limpa a caixa e escreve do zero).
4. O Gastrux registra o que aconteceu com cada sugestão: enviada como estava, enviada com edição, descartada, ou
   expirada (ninguém respondeu antes de fechar a janela de 24 horas).

**Gerar na abertura, não na chegada (minha escolha):** a sugestão é feita quando alguém abre a conversa, não quando
a mensagem chega. Assim não se gasta IA com mensagem que ninguém vai ler (spam, "ok", "obrigado"), o webhook da
Meta continua respondendo rápido, e a sugestão usa sempre a conversa mais recente. Custo: a pessoa espera alguns
segundos ao abrir. A sugestão fica guardada para a última mensagem do cliente: abrir a conversa de novo não gera
outra, salvo se chegou mensagem nova ou se pedirem Nova sugestão.

**Várias mensagens seguidas** do cliente (comum no WhatsApp) recebem uma resposta só, que cobre todas as que vieram
depois da última resposta da equipe.

## O que a IA recebe

- As últimas 20 mensagens da conversa (dos dois lados), com data e hora.
- **Se o número é de um cliente** (o mesmo `clientOf` de hoje): nome do dono, nome do restaurante, tipo de negócio,
  dias desde o cadastro, situação (teste, assinante, sem plano), plano, passos feitos do "Comece por aqui" e o
  próximo passo. Reaproveitar o que `lib/agents/activation/signals.ts` já lê.
- **Se o número não é de nenhum cliente:** a informação de que é alguém sem conta. Nesse caso a resposta explica o
  Gastrux em poucas linhas e leva ao cadastro (`https://gastrux.com`), com o teste de 30 dias grátis, sem cartão.
- O conhecimento completo da IA do Gastrux (`KNOWLEDGE` de `lib/ai/knowledge/index.ts`), que inclui planos e
  preços. Ordem fixa, para aproveitar o cache de prompt.

## Regras da resposta

- Português do Brasil, tom de conversa de WhatsApp: simples, caloroso, direto. Sem jargão, emoji só se o cliente
  usou.
- No máximo 700 caracteres (o mesmo limite do agente de ativação).
- Responde exatamente o que foi perguntado. Se for para levar a uma tela, no máximo um link do Gastrux.
- Só cita funções, preços e regras que estão no conhecimento. Se não souber, diz que vai verificar e passa a
  conversa para a equipe (ver abaixo), nunca inventa.
- Sem assinatura "Equipe Gastrux" na resposta de conversa (minha escolha): no meio de uma conversa ela soa
  robótica, e o número já aparece como Gastrux.
- Nunca promete prazo de correção, desconto, mais dias de teste, cancelamento ou devolução de dinheiro.

## Assuntos que ficam com a equipe

Para estes, a IA **não escreve resposta**. No lugar da sugestão aparece um aviso "Responda você: <motivo>" e a caixa
fica vazia:

- cobrança, pagamento, cancelamento, devolução de dinheiro, nota fiscal da assinatura;
- erro, defeito ou algo que "não funciona" no sistema (precisa de alguém olhar);
- reclamação ou cliente irritado;
- pedido de dados pessoais, LGPD, apagar conta;
- dúvida fiscal ou jurídica do restaurante que vá além do que o conhecimento explica;
- mensagem que não é texto (áudio, foto, documento): a IA não ouve nem vê nesta etapa.

A IA responde num formato estruturado: ou `sugestão` com o texto, ou `equipe` com o motivo em uma linha. Se a
resposta da IA vier fora das regras (longa demais, mais de um link, formato errado) ou a IA falhar, a caixa fica
vazia com o aviso "Sem sugestão desta vez", e a conversa segue como hoje.

## Onde fica guardado

Tabela nova (nome do builder; sugestão `AgentReplySuggestion`), uma linha por sugestão:

- conversa (`phone`) e a mensagem do cliente a que responde (id da última mensagem IN);
- tipo: sugestão ou equipe; texto ou motivo;
- modelo e custo em dólar;
- resultado: pendente, enviada sem mudança, enviada com edição, descartada, expirada; e o id da mensagem enviada,
  quando houver.

"Enviada com edição" compara o texto enviado com o sugerido. Uma diferença pequena (por exemplo, só espaços ou um
nome corrigido) pode contar como "quase igual": o builder define o critério e o deixa escrito no código. O custo
entra no total da tela Custo da IA, como o agente de ativação.

Na tela Conversas, no topo, uma linha simples com os números dos últimos 14 dias: sugestões feitas, % enviadas sem
mudança, % com edição, % descartadas, quantas foram para a equipe. É o que decide a etapa 2.

## Modelo

O modelo padrão da IA do Gastrux (`aiModels().default`, hoje Haiku), o mesmo do agente de ativação. Se as
sugestões saírem fracas nos primeiros dias, troca-se para o modelo `detailed` por variável de ambiente, sem
mudar código (minha escolha: começar barato).

## Sem mudança

- O webhook, o SAIR, a regra das 24 horas e o envio por modelo continuam como estão.
- A Fila "Para aprovar" (mensagens que o agente de ativação inicia) não muda.
- É tela da Plataforma, só para a equipe: não precisa mexer na ajuda dos clientes nem no conhecimento da IA do
  chat (`lib/help/seed-articles.ts`, `lib/ai/knowledge`). O manual de operação ganha um parágrafo.

## Deploy

Uma migração (a tabela nova). Tabela nova não quebra consultas antigas, então a ordem é a de sempre: Deploy, depois
`npx prisma migrate deploy` (homolog, depois app). No homolog, sem o número oficial, a tela Conversas fica vazia e a
sugestão nunca é pedida.

## Testes

- Unidade: montagem do contexto (cliente e não cliente), validação da resposta (limite, um link, formato), assuntos
  que vão para a equipe, critério de "enviada com edição", agrupamento de várias mensagens seguidas.
- Integração: abrir a conversa gera uma sugestão e não gera outra ao reabrir; mensagem nova gera nova sugestão;
  Responder marca o resultado; janela fechada não gera sugestão; IA indisponível (sem `ANTHROPIC_API_KEY`) deixa a
  conversa funcionando como hoje.
- Teste real em produção: o dono manda de outro celular uma pergunta simples ("quanto custa o plano Pro?") e uma de
  cobrança ("quero cancelar"), e confere a sugestão e o aviso.

## Fica para o builder

- Nome da tabela e das rotas, e se a sugestão é pedida pela rota que abre a conversa ou por uma rota separada
  (recomendado separada, para a conversa abrir na hora e a sugestão chegar logo depois, com "Preparando
  sugestão…").
- O critério exato de "quase igual".
- O texto exato do prompt, seguindo as regras acima.

## Etapa 2 (só registro, não faz parte desta)

Resposta automática para perguntas simples, com os assuntos da equipe ainda passando por pessoa. Só com os números
da etapa 1 em mãos e com o OK do dono. Se um dia os anúncios forem para o 0022, a conversa com quem ainda não tem
conta (vendas) ganha regras próprias.
