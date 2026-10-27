# Agente de ativação (pós-venda do teste grátis)

Data: 2026-10-27. O dono pediu agentes de IA para atendimento, financeiro, pós-venda e outros setores da Help Flow
(Gastrux e, depois, Fryonex) e escolheu começar pelo pós-venda/ativação, porque os primeiros cadastros dos anúncios
de Sinop, Sorriso e Lucas do Rio Verde chegam agora. Ele pediu "propor tudo de uma vez": as decisões abaixo são
minhas (Claude), com 4 pontos marcados para ele decidir.

## Para que serve

Quem se cadastra no teste de 30 dias precisa chegar à **primeira venda no sistema** nos primeiros dias. Quem vende
no Gastrux tende a ficar; quem só olha o painel some. Hoje a ajuda é fixa: o cartão "Primeiros passos" na tela
inicial (lib/onboarding/first-steps.ts), 4 e-mails em dias fixos (lib/onboarding/emails.ts: dia 0, 1, 7 e 14) e o
chat da IA, que só responde quando a pessoa pergunta. Ninguém percebe que um cliente travou, e ninguém o procura.

O agente olha cada conta em teste todo dia, vê **onde ela parou** e manda a ajuda certa para aquele ponto, pelo
canal certo, na hora certa. Quando é algo que só uma pessoa resolve, ele avisa o dono.

**Medida de sucesso:** % das contas em teste que fecham a primeira venda até o 7º dia, e % que viram assinantes no
fim do teste. O agente registra tudo para essas duas contas saírem da tela de Clientes.

## O que não é

- Não é o chat de suporte: dúvidas continuam com a IA do chat (lib/ai). O agente puxa a conversa; o chat responde.
- Não mexe em dinheiro: não dá desconto, não estende teste, não cancela, não cobra. Isso continua com o dono
  (/admin/customers já tem "estender teste").
- Não entra na conta do cliente para fazer coisas por ele. Ele aponta o caminho (link da tela + vídeo tutorial).
- Não é o Fryonex ainda (ver "Depois").

## O que seria um fracasso mesmo funcionando

- Mandar mensagem demais: o dono de restaurante bloqueia o número e marca o e-mail como spam.
- Mensagem genérica que não tem a ver com o que a pessoa fez ("Bem-vindo!" para quem já vendeu).
- Prometer o que o sistema não faz, ou números inventados (mesma regra da revisão das promessas do site).
- Escrever para conta interna/de teste, para funcionário ou para quem pediu para parar.
- Fingir ser uma pessoa. As mensagens assinam como "Equipe Gastrux".

## Como funciona

### 1. O que o agente enxerga (sinais)

Tudo já existe no banco; nada novo para o cliente preencher, exceto o WhatsApp (ponto 3):
- etapas de `onboardingStatus()`: caixa, primeira venda, cardápio próprio, mesas, endereço, NFC-e (+ equipe opcional);
- estágio de `clientStage()` (Cadastrou / Montou o cardápio / Vendendo / Assinante) e alertas de `clientAlerts()`;
- dias desde o cadastro, fim do teste, último acesso, tipo de negócio respondido na qualificação (pizzaria,
  espetaria, padaria...), cidade;
- histórico do próprio agente: o que já mandou, quando, se a pessoa respondeu ou clicou.

### 2. Quando ele age (regras fixas, não a IA)

A decisão de **quando** e **por quê** é por regra escrita no código, testável. A IA só escreve o texto.

| Gatilho | Situação | Ajuda |
|---|---|---|
| Boas-vindas | cadastro há 5 min | caminho mais curto até vender no tipo de negócio dele + vídeo "Comece por aqui" |
| Cardápio parado | dia 1, ainda só o cardápio de exemplo | "mande uma foto do cardápio no chat que a IA monta" |
| Sem caixa | dia 2, cardápio pronto, caixa nunca aberto | abrir o caixa e fazer uma venda de teste (vídeo do Vender) |
| Sem venda | dia 3, caixa aberto, nenhuma venda fechada | passo a passo da primeira comanda (vídeo) |
| Sumiu | 3 dias sem entrar, ainda não vende | mensagem curta perguntando se travou em algo |
| Já vende | primeira venda fechada | parabéns + próximo valor do tipo dele (custo do prato, contagem de espetos, NFC-e) |
| Fim do teste chegando | 5 dias para acabar | vendendo: como assinar; não vendendo: **chama o dono** |

Limites: no máximo 1 mensagem por dia e 3 por semana por cliente; só das 8h às 20h **no fuso do restaurante**
(Sinop é UTC-4; `Restaurant.timezone`); nada para `isInternal`, staff, plataforma ou quem parou as dicas.

### 3. Por onde fala

- **E-mail** (Resend, já em uso) desde o começo.
- **Aviso dentro do sistema** (sino + cartão na tela inicial) desde o começo.
- **WhatsApp**, o canal que dono de restaurante lê. Precisa de duas coisas que não existem:
  1. o número do cliente: campo novo **"WhatsApp"** no cadastro (qualificação), com o motivo ao lado;
  2. um número de WhatsApp Business **do Gastrux** na API oficial da Meta, com modelos de mensagem aprovados
     (a Meta exige modelo aprovado para a empresa puxar conversa).
  Até o número oficial existir, a mensagem de WhatsApp sai como **rascunho com botão "Abrir no WhatsApp"**
  (link wa.me com o texto pronto) na fila do dono: ele toca e envia do próprio celular.

### 4. Quem aprova (começa com você no controle)

**Fase 1 (primeiras 2-3 semanas): fila de aprovação.** O agente monta cada mensagem e ela fica numa fila nova em
Plataforma Gastrux > Clientes ("Fila do agente"): cliente, motivo, canal, texto. O dono aprova, edita ou descarta.
Aprovado: o e-mail sai na hora; o WhatsApp abre pronto.

**Fase 2: automático por tipo.** Os tipos de mensagem que o dono aprovou sem mexer (ex.: 90% aprovadas sem edição)
passam a sair sozinhos, um por um, com um interruptor por tipo. O resto continua na fila.

### 5. Quando ele chama você

Aviso no sino da plataforma e e-mail para o dono quando:
- faltam 5 dias para o teste acabar e o cliente ainda não vende;
- o cliente respondeu falando de preço, desconto, cancelamento ou reclamação;
- o cliente ficou 3 dias na mesma etapa depois de 2 mensagens;
- qualquer resposta que o agente não sabe classificar.
O aviso traz o resumo da conta e um texto sugerido para o dono mandar.

### 6. Registro

Cada ação vira uma linha (tabela nova, ex.: `AgentAction`): cliente, gatilho, canal, texto, situação (rascunho,
aprovado, enviado, respondido, descartado), quem aprovou, data. Aparece na ficha do cliente (/admin/customers/[id])
junto com as notas da equipe. É daí que saem as medidas de sucesso.

### 7. Como roda

Uma rotina a cada 5 minutos (crontab do VPS, como as outras, POST com CRON_SECRET) avalia as contas em teste,
aplica as regras e cria os rascunhos (ou envia, na fase 2); cada gatilho só dispara uma vez por conta, então rodar
mais vezes não repete mensagem. Os 5 minutos existem por causa das boas-vindas; os outros gatilhos são por dia. Texto escrito com o Claude que o Gastrux já usa (lib/ai), com a
base de conhecimento (lib/ai/knowledge) e os dados daquela conta; custo registrado como os outros usos de IA.

### 8. E-mails fixos de hoje

Os 4 e-mails fixos (dia 0, 1, 7, 14) e o agente falariam ao mesmo tempo. Proposta: o agente **substitui** os do
dia 1, 7 e 14 (o de boas-vindas vira o gatilho "Boas-vindas"). O botão "Parar as dicas" continua valendo para tudo.

## Depois: base para os outros agentes e para o Fryonex

O agente é montado em peças que os próximos reaproveitam: **sinais** (o que o produto informa sobre cada cliente),
**regras** (quando agir), **redação** (IA + base de conhecimento), **canais** (e-mail, sino, WhatsApp), **fila de
aprovação** e **registro**. Atendimento, vendas (SDR) e financeiro usam a mesma fila e o mesmo registro, com regras e
permissões próprias. Fica dentro do Gastrux primeiro; quando o agente do Fryonex começar, as peças comuns saem para
um pacote da Help Flow (decidir naquela hora, com o Fryonex na mesa). Não construir agora nada só para o Fryonex.

## Decisões do dono (2026-10-27)

1. **WhatsApp no cadastro: obrigatório**, com o texto "para receber ajuda durante o teste" e como parar
   (responder SAIR ou o link "Parar as dicas", que vale para todos os canais).
2. **Número oficial de WhatsApp do Gastrux: sim.** O chip dedicado fica livre em **29/10/2026**; depois vêm a
   verificação da empresa (Help Flow) no portfólio da Meta e os modelos de mensagem (categoria "utilidade" para a
   ajuda). Até lá, e para quem ainda não tem modelo aprovado, o WhatsApp sai pelo botão "Abrir no WhatsApp".
3. **Fila de aprovação: sim**, nas primeiras 2-3 semanas; depois, automático por tipo.
4. **Os e-mails fixos do dia 1, 7 e 14 saem**; o agente os substitui.

Acrescentado na mesma conversa (o que o mercado pratica e dá resultado):
- **Boas-vindas em até 5 minutos** depois do cadastro (não 1 hora): é quando a pessoa ainda está com o sistema aberto.
- **Ajuda para montar:** a primeira mensagem oferece a montagem do cardápio pela IA (foto do cardápio) e uma
  **conversa de 15 minutos com o dono** para quem quiser; o pedido de conversa vira aviso para o dono.
- **Toda mensagem puxa para a primeira venda**, que é o momento em que o cliente vê o valor.
- **"O que faltou?"**: quem chega ao fim do teste sem assinar recebe uma pergunta curta; a resposta vai para o dono
  e fica na ficha do cliente.
- **Fim do teste com o dono:** nos últimos dias, o agente prepara o texto e o dono manda; desconto e prazo extra
  continuam só com ele.

## Fica para quem constrói

Texto exato de cada gatilho (seguindo o tom dos e-mails atuais e as regras de não prometer o que não existe), o
desenho da fila na tela de Clientes, os nomes das tabelas, a classificação das respostas (começa simples: resposta
de e-mail cai para o dono). Artigos de ajuda e base da IA atualizados como em toda função nova.
