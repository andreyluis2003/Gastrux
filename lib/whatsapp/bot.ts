/**
 * Máquina de estados do bot WhatsApp.
 * - Recebe mensagem do cliente (text / button / list)
 * - Atualiza estado/carrinho da conversa
 * - Responde via MetaCloudClient
 */

import { prisma } from '@/lib/prisma';
import { MetaCloudClient, normalizePhone } from './meta-client';
import type { WhatsAppConversation, WhatsAppConfig } from '@prisma/client';

type CartItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
};

export interface InboundMessage {
  from: string; // phone number E.164 sem +
  text?: string; // conteúdo de texto (se tipo text)
  buttonId?: string; // payload de button_reply
  listId?: string; // payload de list_reply
  profileName?: string;
  waMessageId?: string;
}

interface BotContext {
  config: WhatsAppConfig;
  conversation: WhatsAppConversation;
  client: MetaCloudClient;
  restaurantId: string;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseCart(raw: any): CartItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as CartItem[];
  return [];
}

function cartTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

export async function handleInboundMessage(
  restaurantId: string,
  msg: InboundMessage,
): Promise<void> {
  const config = await (prisma as any).whatsAppConfig.findUnique({ where: { restaurantId } });
  if (!config || !config.isActive || !config.accessToken || !config.phoneNumberId) {
    console.log('[wa-bot] config not active for restaurant', restaurantId);
    return;
  }

  const phone = normalizePhone(msg.from);

  // Obtem ou cria conversa
  let conversation = await (prisma as any).whatsAppConversation.findUnique({
    where: { restaurantId_phoneNumber: { restaurantId, phoneNumber: phone } },
  });
  if (!conversation) {
    conversation = await (prisma as any).whatsAppConversation.create({
      data: {
        restaurantId,
        phoneNumber: phone,
        profileName: msg.profileName,
        state: 'GREETING',
      },
    });
    await (prisma as any).whatsAppConfig.update({
      where: { restaurantId },
      data: { totalConversations: { increment: 1 } },
    });
    // Captura lead automaticamente
    try {
      await (prisma as any).marketingLead.upsert({
        where: { id: `wa-${restaurantId}-${phone}` },
        create: {
          source: 'WHATSAPP',
          sourceDetail: 'bot-conversation',
          phoneNumber: phone,
          name: msg.profileName || null,
          restaurantId,
          score: 25,
          metadata: { profileName: msg.profileName, firstMessageAt: new Date().toISOString() },
        },
        update: {
          score: { increment: 5 },
        },
      });
    } catch (leadErr: any) {
      // Lead capture é best-effort, busca por phoneNumber como fallback
      try {
        const existingLead = await (prisma as any).marketingLead.findFirst({
          where: { phoneNumber: phone, source: 'WHATSAPP' },
        });
        if (!existingLead) {
          await (prisma as any).marketingLead.create({
            data: {
              source: 'WHATSAPP',
              sourceDetail: 'bot-conversation',
              phoneNumber: phone,
              name: msg.profileName || null,
              restaurantId,
              score: 25,
              metadata: { profileName: msg.profileName, firstMessageAt: new Date().toISOString() },
            },
          });
        }
      } catch { /* ignore */ }
    }
  }

  // Idempotência: se waMessageId já existir, ignore
  if (msg.waMessageId) {
    const existing = await (prisma as any).whatsAppMessage.findUnique({
      where: { waMessageId: msg.waMessageId },
    });
    if (existing) return;
  }

  // Grava mensagem inbound
  await (prisma as any).whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      type: msg.buttonId ? 'BUTTON_REPLY' : msg.listId ? 'LIST_REPLY' : 'TEXT',
      content: msg.text || msg.buttonId || msg.listId || '',
      waMessageId: msg.waMessageId,
    },
  });

  const client = new MetaCloudClient({
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  });

  const ctx: BotContext = { config, conversation, client, restaurantId };

  // Roteamento
  try {
    await route(ctx, msg);
    await (prisma as any).whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await (prisma as any).whatsAppConfig.update({
      where: { restaurantId },
      data: { lastActivityAt: new Date() },
    });
  } catch (err: any) {
    console.error('[wa-bot] route error:', err?.message || err);
    await safeSendText(ctx, '😓 Ops! Tivemos um problema ao processar. Digite *menu* para recomeçar.');
  }
}

async function route(ctx: BotContext, msg: InboundMessage) {
  const text = (msg.text || '').trim().toLowerCase();
  const button = msg.buttonId || null;
  const list = msg.listId || null;

  // Comandos globais
  if (['menu', 'cardapio', 'cardápio', 'oi', 'olá', 'ola', 'começar', 'comecar', 'start'].includes(text)) {
    return handleGreeting(ctx);
  }
  if (['carrinho', 'ver carrinho', 'meu pedido', 'pedido'].includes(text)) {
    return handleViewCart(ctx);
  }
  if (['cancelar', 'limpar', 'resetar', 'reset'].includes(text)) {
    return handleReset(ctx);
  }
  if (['humano', 'atendente', 'falar com alguém', 'ajuda'].includes(text)) {
    return handleHumanHandoff(ctx);
  }

  // Button payloads
  if (button) {
    if (button === 'BTN_VIEW_MENU') return handleShowCategories(ctx);
    if (button === 'BTN_VIEW_CART') return handleViewCart(ctx);
    if (button === 'BTN_CHECKOUT') return handleStartCheckout(ctx);
    if (button === 'BTN_CONTINUE_SHOPPING') return handleShowCategories(ctx);
    if (button === 'BTN_CANCEL') return handleReset(ctx);
    if (button.startsWith('BTN_ORDERTYPE_')) {
      const type = button.replace('BTN_ORDERTYPE_', '') as 'DELIVERY' | 'PICKUP' | 'DINE_IN';
      return handleSelectOrderType(ctx, type);
    }
    if (button === 'BTN_CONFIRM_ORDER') return handleConfirmOrder(ctx);
  }

  // List payloads
  if (list) {
    if (list.startsWith('CAT_')) {
      const categoryId = list.replace('CAT_', '');
      return handleShowCategoryItems(ctx, categoryId);
    }
    if (list.startsWith('ITEM_')) {
      const menuItemId = list.replace('ITEM_', '');
      return handleAddItem(ctx, menuItemId);
    }
  }

  // Estado baseado em texto livre
  if (ctx.conversation.state === 'COLLECTING_INFO') {
    return handleCollectInfo(ctx, msg.text || '');
  }
  if (ctx.conversation.state === 'ITEM_SELECTED') {
    const qty = parseInt(text, 10);
    if (!Number.isNaN(qty) && qty > 0 && qty <= 99) {
      return handleApplyQuantity(ctx, qty);
    }
  }

  // Fallback
  return safeSendText(
    ctx,
    'Desculpe, não entendi. 🤔\n\nDigite *menu* para ver o cardápio, *carrinho* para ver seus itens, ou *ajuda* para falar com um atendente.',
  );
}

async function handleGreeting(ctx: BotContext) {
  await updateState(ctx, 'MENU_BROWSING');
  const greeting = ctx.config.greeting || 'Olá! 👋 Bem-vindo!';
  try {
    await ctx.client.sendButtons({
      to: ctx.conversation.phoneNumber,
      header: 'Atendimento',
      body: greeting,
      footer: ctx.config.businessHours || undefined,
      buttons: [
        { id: 'BTN_VIEW_MENU', title: 'Ver cardápio' },
        { id: 'BTN_VIEW_CART', title: 'Meu carrinho' },
        { id: 'BTN_CANCEL', title: 'Cancelar' },
      ],
    });
    await recordOutbound(ctx, greeting, 'INTERACTIVE');
  } catch {
    await safeSendText(ctx, greeting);
  }
}

async function handleShowCategories(ctx: BotContext) {
  const categories = await prisma.menuCategory.findMany({
    where: { active: true, items: { some: { active: true, available: true } } },
    orderBy: { position: 'asc' },
    take: 10,
  });

  if (categories.length === 0) {
    return safeSendText(ctx, '📋 Nosso cardápio está sendo atualizado. Tente novamente em alguns minutos.');
  }

  await updateState(ctx, 'MENU_BROWSING');

  try {
    await ctx.client.sendList({
      to: ctx.conversation.phoneNumber,
      header: 'Cardápio',
      body: 'Selecione uma categoria abaixo para ver os itens disponíveis.',
      buttonLabel: 'Ver categorias',
      sections: [
        {
          title: 'Categorias',
          rows: categories.map((c) => ({
            id: `CAT_${c.id}`,
            title: `${c.emoji ? c.emoji + ' ' : ''}${c.name}`.slice(0, 24),
            description: c.description?.slice(0, 72) || undefined,
          })),
        },
      ],
    });
    await recordOutbound(ctx, 'Lista de categorias', 'INTERACTIVE');
  } catch {
    const lines = categories.map((c, i) => `${i + 1}. ${c.emoji || ''} ${c.name}`).join('\n');
    await safeSendText(ctx, `📋 *Cardápio*\n\n${lines}\n\nDigite o nome da categoria que deseja.`);
  }
}

async function handleShowCategoryItems(ctx: BotContext, categoryId: string) {
  const items = await prisma.menuItem.findMany({
    where: { categoryId, active: true, available: true },
    orderBy: { position: 'asc' },
    take: 10,
    include: { category: true },
  });

  if (items.length === 0) {
    return safeSendText(ctx, '😔 Nenhum item disponível nesta categoria no momento.');
  }

  const categoryName = items[0].category.name;
  await updateContext(ctx, { currentCategoryId: categoryId });

  try {
    await ctx.client.sendList({
      to: ctx.conversation.phoneNumber,
      header: categoryName.slice(0, 60),
      body: 'Escolha um item para adicionar ao carrinho.',
      buttonLabel: 'Ver itens',
      sections: [
        {
          title: categoryName.slice(0, 24),
          rows: items.map((it) => ({
            id: `ITEM_${it.id}`,
            title: it.name.slice(0, 24),
            description: `${fmtBRL(Number(it.price))}${it.description ? ' · ' + it.description.slice(0, 40) : ''}`.slice(0, 72),
          })),
        },
      ],
    });
    await recordOutbound(ctx, `Itens: ${categoryName}`, 'INTERACTIVE');
  } catch {
    const lines = items
      .map((it, i) => `${i + 1}. ${it.name} — ${fmtBRL(Number(it.price))}`)
      .join('\n');
    await safeSendText(ctx, `*${categoryName}*\n\n${lines}`);
  }
}

async function handleAddItem(ctx: BotContext, menuItemId: string) {
  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, active: true, available: true },
  });
  if (!item) {
    return safeSendText(ctx, 'Item não encontrado. Digite *menu* para ver o cardápio novamente.');
  }

  await updateContext(ctx, {
    ...((ctx.conversation.context as any) || {}),
    pendingItem: {
      menuItemId: item.id,
      name: item.name,
      price: Number(item.price),
    },
  });
  await updateState(ctx, 'ITEM_SELECTED');

  await safeSendText(
    ctx,
    `Você escolheu *${item.name}* — ${fmtBRL(Number(item.price))}.\n\nQuantas unidades? (ex: 1, 2, 3...)`,
  );
}

async function handleApplyQuantity(ctx: BotContext, qty: number) {
  const pending = ((ctx.conversation.context as any) || {}).pendingItem;
  if (!pending) {
    return safeSendText(ctx, 'Selecione um item primeiro. Digite *menu* para começar.');
  }
  const cart = parseCart(ctx.conversation.cart);
  const existing = cart.find((c) => c.menuItemId === pending.menuItemId);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      menuItemId: pending.menuItemId,
      name: pending.name,
      price: pending.price,
      quantity: qty,
    });
  }
  const total = cartTotal(cart);
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: {
      cart,
      cartTotal: total,
      context: { ...(ctx.conversation.context as any), pendingItem: null },
      state: 'CART_REVIEW',
    },
  });
  ctx.conversation = await (prisma as any).whatsAppConversation.findUnique({
    where: { id: ctx.conversation.id },
  });

  try {
    await ctx.client.sendButtons({
      to: ctx.conversation.phoneNumber,
      header: 'Item adicionado',
      body: `✅ ${qty}x ${pending.name} — ${fmtBRL(pending.price * qty)}\n\nSubtotal: ${fmtBRL(total)}`,
      buttons: [
        { id: 'BTN_CONTINUE_SHOPPING', title: 'Mais itens' },
        { id: 'BTN_CHECKOUT', title: 'Finalizar' },
        { id: 'BTN_VIEW_CART', title: 'Ver carrinho' },
      ],
    });
    await recordOutbound(ctx, 'Item adicionado', 'INTERACTIVE');
  } catch {
    await safeSendText(ctx, `✅ Adicionado. Subtotal: ${fmtBRL(total)}. Digite *finalizar* para concluir ou *menu* para continuar.`);
  }
}

async function handleViewCart(ctx: BotContext) {
  const cart = parseCart(ctx.conversation.cart);
  if (cart.length === 0) {
    return safeSendText(ctx, '🛒 Seu carrinho está vazio. Digite *menu* para ver o cardápio.');
  }
  const lines = cart.map(
    (c, i) => `${i + 1}. ${c.quantity}x ${c.name} — ${fmtBRL(c.price * c.quantity)}`,
  );
  const total = cartTotal(cart);
  const text = `🛒 *Seu carrinho*\n\n${lines.join('\n')}\n\n*Total: ${fmtBRL(total)}*`;

  try {
    await ctx.client.sendButtons({
      to: ctx.conversation.phoneNumber,
      body: text,
      buttons: [
        { id: 'BTN_CHECKOUT', title: 'Finalizar' },
        { id: 'BTN_CONTINUE_SHOPPING', title: 'Adicionar mais' },
        { id: 'BTN_CANCEL', title: 'Limpar' },
      ],
    });
    await recordOutbound(ctx, text, 'INTERACTIVE');
  } catch {
    await safeSendText(ctx, text + '\n\nDigite *finalizar* para concluir ou *cancelar* para limpar.');
  }
}

async function handleStartCheckout(ctx: BotContext) {
  const cart = parseCart(ctx.conversation.cart);
  if (cart.length === 0) {
    return safeSendText(ctx, 'Seu carrinho está vazio. Digite *menu* para adicionar itens.');
  }
  await updateState(ctx, 'ORDER_TYPE');
  try {
    await ctx.client.sendButtons({
      to: ctx.conversation.phoneNumber,
      header: 'Como deseja receber?',
      body: 'Escolha o tipo do seu pedido:',
      buttons: [
        { id: 'BTN_ORDERTYPE_DELIVERY', title: '🛵 Delivery' },
        { id: 'BTN_ORDERTYPE_PICKUP', title: '🏃 Retirada' },
        { id: 'BTN_ORDERTYPE_DINE_IN', title: '🍽️ Na mesa' },
      ],
    });
    await recordOutbound(ctx, 'Seleção tipo de pedido', 'INTERACTIVE');
  } catch {
    await safeSendText(
      ctx,
      'Como deseja receber? Responda: *delivery*, *retirada* ou *mesa*.',
    );
  }
}

async function handleSelectOrderType(ctx: BotContext, type: 'DELIVERY' | 'PICKUP' | 'DINE_IN') {
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: { orderType: type, state: 'COLLECTING_INFO' },
  });
  ctx.conversation = await (prisma as any).whatsAppConversation.findUnique({
    where: { id: ctx.conversation.id },
  });

  if (type === 'DELIVERY') {
    return safeSendText(
      ctx,
      'Por favor, envie seu *nome completo* e o *endereço de entrega* em uma mensagem.\n\nExemplo: *João Silva - Rua das Flores, 123, Bairro Centro*',
    );
  }
  if (type === 'PICKUP') {
    return safeSendText(ctx, 'Perfeito! Envie seu *nome completo* para retirada.');
  }
  if (type === 'DINE_IN') {
    return safeSendText(
      ctx,
      'Ótimo! Envie seu *nome* e o *número da mesa*.\n\nExemplo: *Maria - Mesa 5*',
    );
  }
}

async function handleCollectInfo(ctx: BotContext, rawText: string) {
  const cleaned = rawText.trim();
  if (!cleaned) {
    return safeSendText(ctx, 'Por favor, envie as informações solicitadas.');
  }
  const data: any = { customerName: null, deliveryAddress: null, tableNumber: null };
  const type = ctx.conversation.orderType;

  if (type === 'DELIVERY') {
    const parts = cleaned.split('-').map((s) => s.trim());
    data.customerName = parts[0] || cleaned;
    data.deliveryAddress = parts.slice(1).join(' - ') || cleaned;
  } else if (type === 'PICKUP') {
    data.customerName = cleaned;
  } else if (type === 'DINE_IN') {
    const parts = cleaned.split('-').map((s) => s.trim());
    data.customerName = parts[0] || cleaned;
    const mesaMatch = (parts[1] || cleaned).match(/(\d+)/);
    data.tableNumber = mesaMatch ? parseInt(mesaMatch[1], 10) : null;
  }

  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: {
      customerName: data.customerName,
      deliveryAddress: data.deliveryAddress,
      tableNumber: data.tableNumber,
      state: 'CONFIRMING',
    },
  });
  ctx.conversation = await (prisma as any).whatsAppConversation.findUnique({
    where: { id: ctx.conversation.id },
  });

  return handleShowConfirmation(ctx);
}

async function handleShowConfirmation(ctx: BotContext) {
  const cart = parseCart(ctx.conversation.cart);
  const lines = cart.map((c) => `• ${c.quantity}x ${c.name} — ${fmtBRL(c.price * c.quantity)}`);
  const total = cartTotal(cart);
  const typeLabel =
    ctx.conversation.orderType === 'DELIVERY'
      ? `Delivery para: ${ctx.conversation.deliveryAddress || '—'}`
      : ctx.conversation.orderType === 'PICKUP'
      ? `Retirada no balcão`
      : `Consumir na Mesa ${ctx.conversation.tableNumber || '—'}`;

  const summary = `📋 *Resumo do pedido*\n\nCliente: ${ctx.conversation.customerName || '—'}\n${typeLabel}\n\n${lines.join('\n')}\n\n*Total: ${fmtBRL(total)}*\n\nConfirmar?`;

  try {
    await ctx.client.sendButtons({
      to: ctx.conversation.phoneNumber,
      body: summary,
      buttons: [
        { id: 'BTN_CONFIRM_ORDER', title: '✅ Confirmar' },
        { id: 'BTN_CANCEL', title: '❌ Cancelar' },
        { id: 'BTN_CONTINUE_SHOPPING', title: '➕ Adicionar mais' },
      ],
    });
    await recordOutbound(ctx, summary, 'INTERACTIVE');
  } catch {
    await safeSendText(ctx, summary + '\n\nResponda *confirmar* ou *cancelar*.');
  }
}

async function handleConfirmOrder(ctx: BotContext) {
  const cart = parseCart(ctx.conversation.cart);
  if (cart.length === 0) {
    return safeSendText(ctx, 'Seu carrinho está vazio.');
  }

  // Obter owner do restaurante para userId
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    select: { ownerId: true },
  });
  if (!restaurant) {
    return safeSendText(ctx, '😓 Não conseguimos processar seu pedido. Tente novamente.');
  }

  // Map MenuItem → recipeId
  const menuItemIds = cart.map((c) => c.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, recipeId: true, name: true, price: true },
  });
  const missing = menuItems.filter((mi) => !mi.recipeId);
  if (missing.length > 0) {
    return safeSendText(
      ctx,
      `😓 Alguns itens não estão disponíveis agora: ${missing.map((m) => m.name).join(', ')}. Por favor, escolha outros itens.`,
    );
  }

  // Achar mesa se DINE_IN
  let tableId: string | null = null;
  if (ctx.conversation.orderType === 'DINE_IN' && ctx.conversation.tableNumber) {
    const table = await prisma.table.findFirst({
      where: { restaurantId: ctx.restaurantId, number: ctx.conversation.tableNumber },
    });
    tableId = table?.id || null;
  }

  const session = await prisma.orderSession.create({
    data: {
      restaurantId: ctx.restaurantId,
      userId: restaurant.ownerId,
      tableId,
      tableNumber: ctx.conversation.tableNumber || undefined,
      customerName: ctx.conversation.customerName || ctx.conversation.profileName || undefined,
      notes: `Pedido via WhatsApp (${ctx.conversation.phoneNumber})${
        ctx.conversation.orderType === 'DELIVERY' && ctx.conversation.deliveryAddress
          ? `\nEndereço: ${ctx.conversation.deliveryAddress}`
          : ''
      }`,
      status: 'SENT_TO_KITCHEN',
      sentToKitchenAt: new Date(),
      items: {
        create: cart.map((c) => {
          const mi = menuItems.find((m) => m.id === c.menuItemId)!;
          return {
            recipeId: mi.recipeId!,
            quantity: c.quantity,
            price: c.price,
          };
        }),
      },
    },
  });

  // Atualiza conversa
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: {
      orderSessionId: session.id,
      state: 'COMPLETED',
      cart: [],
      cartTotal: 0,
      closedAt: new Date(),
    },
  });
  await (prisma as any).whatsAppConfig.update({
    where: { restaurantId: ctx.restaurantId },
    data: { totalOrders: { increment: 1 } },
  });

  const total = cartTotal(cart);
  await safeSendText(
    ctx,
    `✅ *Pedido confirmado!*\n\nNº: ${session.id.slice(-6).toUpperCase()}\nTotal: ${fmtBRL(total)}\n\nSeu pedido foi enviado para a cozinha. Obrigado! 🙌\n\nDigite *menu* para fazer um novo pedido.`,
  );
}

async function handleReset(ctx: BotContext) {
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: {
      state: 'GREETING',
      cart: [],
      cartTotal: 0,
      context: {},
      orderType: null,
      deliveryAddress: null,
      tableNumber: null,
      customerName: null,
      customerNotes: null,
    },
  });
  await safeSendText(ctx, '🧹 Conversa reiniciada. Digite *menu* para ver o cardápio.');
}

async function handleHumanHandoff(ctx: BotContext) {
  await updateState(ctx, 'HUMAN_HANDOFF');
  await safeSendText(
    ctx,
    '👨‍💼 Um atendente será notificado e retornará em breve. Enquanto isso, você pode digitar *menu* para voltar ao atendimento automático.',
  );
}

// ===================== Helpers =====================

async function updateState(ctx: BotContext, state: string) {
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: { state },
  });
  ctx.conversation = { ...ctx.conversation, state: state as any };
}

async function updateContext(ctx: BotContext, context: any) {
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: { context },
  });
  ctx.conversation = { ...ctx.conversation, context };
}

async function recordOutbound(
  ctx: BotContext,
  content: string,
  type: 'TEXT' | 'INTERACTIVE' = 'TEXT',
) {
  await (prisma as any).whatsAppMessage.create({
    data: {
      conversationId: ctx.conversation.id,
      direction: 'OUTBOUND',
      type,
      content,
    },
  });
  await (prisma as any).whatsAppConversation.update({
    where: { id: ctx.conversation.id },
    data: { lastBotReplyAt: new Date() },
  });
}

async function safeSendText(ctx: BotContext, text: string) {
  try {
    await ctx.client.sendText({ to: ctx.conversation.phoneNumber, text });
    await recordOutbound(ctx, text, 'TEXT');
  } catch (err: any) {
    console.error('[wa-bot] sendText failed:', err?.message || err);
  }
}
