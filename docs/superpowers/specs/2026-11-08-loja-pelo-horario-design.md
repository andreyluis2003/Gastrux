# Abrir e fechar a loja pelo horário (2026-11-08)

Pedido do dono ("pode seguir com abrir e fechar pelo horário"). Continua a loja aberta/fechada manual
(`docs/superpowers/specs/2026-11-07-quadro-de-pedidos-design.md` §A). Decisões minhas.

## Por quê

O horário de funcionamento fica em Configurações e não servia para nada. Quem esquece de fechar a loja recebe
pedido de madrugada pelo site, pelo WhatsApp e pela API.

## Decisões

1. **Liga e desliga em Configurações > Horário de funcionamento:** caixa "Abrir e fechar a loja sozinha por este
   horário", **desligada por padrão**. O horário de fábrica (11h às 23h) aparece para quem nunca o configurou;
   ligar sem conferir fecharia lojas no horário errado.
2. **Guardado no próprio `businessHours`** (`auto: true`), sem migração.
3. **Fechada = fechada à mão OU (automático ligado E fora do horário).** Fechar à mão sempre vale. Fora do horário,
   o botão Loja aberta/fechada mostra "Fechada pelo horário · abre <dia> às <hora>" e não abre à mão: para abrir
   antes, desliga o automático ou muda o horário (link para Configurações). Assim não há estado "aberta à força"
   que alguém esquece ligado.
4. **Fechamento depois da meia-noite:** "18:00 às 02:00" vale até as 2h do dia seguinte; "00:00" no fechar é
   meia-noite. Abrir igual a fechar = fechado o dia todo. O dia e a hora são os do fuso do restaurante.
5. **O que bloqueia:** o mesmo da loja fechada à mão (site, WhatsApp de delivery, API de pedidos). **O iFood não é
   pausado pelo horário:** ele segue o horário cadastrado no próprio iFood.
6. **Site de delivery:** "Fechado agora · abre hoje às 18:00" (ou "abre sexta às 11:00").
7. Horário salvo é conferido no servidor: dias conhecidos, horas HH:MM; o resto é descartado.

## Fora

Pausas no meio do dia (dois turnos), feriados, horário diferente para retirada e entrega.
