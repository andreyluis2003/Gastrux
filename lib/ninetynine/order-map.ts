import type { OrderApiInput, OrderApiPaymentForm } from '@/lib/delivery-orders/input';
import { sanitizeCustomerNote, singleLine } from '@/lib/delivery-payments/order-input';

/**
 * A 99Food order (order_info of orderNew / order detail) as the input of the delivery order pipeline, plus the ticket
 * lines the 99Food go-live asks for (order_index, order_id, handover/takeaway code, cash to collect).
 * Prices arrive in cents. Sale value: items + options, + delivery fee only for store delivery (delivery_type 2),
 * minus the promotions the store pays (shop_subside_price); what 99Food pays does not reduce the sale.
 */
const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const cents = (v: unknown) => round2(num(typeof v === 'string' && v.trim() !== '' ? Number(v) : v) / 100);
const str = (v: unknown, max = 200) => (typeof v === 'string' || typeof v === 'number' ? singleLine(String(v)).trim().slice(0, max) : '');
const opt = (v: unknown, max = 200) => str(v, max) || undefined;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

const PRIVATE = 'privacy protection';
/** A masked field comes back as the literal "privacy protection": treat it as absent. */
const open = (v: unknown, max = 200) => { const s = str(v, max); return s && s.toLowerCase() !== PRIVATE ? s : ''; };

const CHANNEL_FORM: Record<number, OrderApiPaymentForm> = {
  150: 'CREDITO', 212: 'PIX', 280: 'PIX', 262: 'CREDITO', 263: 'DEBITO', 264: 'VALE_REFEICAO',
  257: 'VALE_REFEICAO', 258: 'VALE_REFEICAO', 259: 'VALE_REFEICAO', 260: 'VALE_REFEICAO', 153: 'DINHEIRO',
};
const CHANNEL_LABEL: Record<number, string> = {
  110: 'Cupom', 150: 'Cartão (crédito/débito)', 153: 'Dinheiro', 154: 'Maquininha', 190: '99Pay', 120: 'Carteira',
  212: 'PIX', 280: 'PIX', 229: 'NuPay', 234: 'Apple Pay', 235: 'Apple Pay', 257: 'Vale-refeição Pluxee', 258: 'Vale-refeição Ticket',
  259: 'Vale-refeição VR', 260: 'Vale-refeição Alelo', 262: 'Maquininha crédito', 263: 'Maquininha débito', 264: 'Maquininha vale-refeição',
  272: 'Google Pay', 273: 'Google Pay',
};

export interface NinetyninePlatformData {
  orderIndex: number;
  orderId: string;
  deliveryType: 0 | 1 | 2;
  fulfillmentMode: 0 | 1;
  payType: number;
  payChannel: number;
  handoverCode: string | null;
  takeawayCode: string | null;
  /** Cash the 99Food courier pays the store (99Food delivery, cash order); null when absent. */
  shopPaidMoney: number | null;
  /** Cash the store's own courier collects from the customer (store delivery, cash order). */
  cashToCollect: number | null;
}

function weightText(w: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'kg' || u === 'kilogram') return `${String(round2(w)).replace('.', ',')} kg`;
  if (u === 'gram' || u === 'g' || u === '') return `${Math.round(w)} g`;
  return `${String(round2(w)).replace('.', ',')} ${unit}`;
}

function flattenSubs(list: unknown, prefix: string, out: Array<{ nome: string; preco: number }>) {
  if (!Array.isArray(list)) return;
  for (const s of list as any[]) {
    const name = str(s?.name, 80);
    if (!name) continue;
    const label = `${prefix}${Math.max(1, Math.round(num(s?.amount)) || 1)}x ${name}`;
    out.push({ nome: label.slice(0, 80), preco: 0 });
    flattenSubs(s?.sub_item_list, `${label} > `, out);
  }
}

export function mapNinetynineOrder(order: any): { input: OrderApiInput; extraNote: string; platformData: NinetyninePlatformData } {
  const orderId = str(order?.order_id, 80);
  const orderIndex = Math.round(num(order?.order_index));
  const deliveryType = ([0, 1, 2].includes(Number(order?.delivery_type)) ? Number(order.delivery_type) : 1) as 0 | 1 | 2;
  const fulfillmentMode = (Number(order?.fulfillment_mode) === 1 ? 1 : 0) as 0 | 1;
  const retirada = fulfillmentMode === 1 || deliveryType === 0;
  const storeDelivery = deliveryType === 2;
  const payType = Math.round(num(order?.pay_type));
  const payMethod = Math.round(num(order?.pay_method));
  const payChannel = Math.round(num(order?.pay_channel));
  const price = order?.price ?? {};

  const itens: OrderApiInput['itens'] = (Array.isArray(order?.order_items) ? order.order_items : []).map((it: any) => {
    const quantidade = Math.max(1, Math.round(num(it?.amount)) || 1);
    const total = cents(it?.total_price) || cents(it?.sku_price) * quantidade;
    const adicionais: Array<{ nome: string; preco: number }> = [];
    flattenSubs(it?.sub_item_list, '', adicionais);
    const weight = num(it?.weight) > 0 && str(it?.sales_type) === 'weight' ? ` (${weightText(num(it.weight), str(it?.weight_unit))})` : '';
    return {
      codigo: opt(it?.app_item_id, 60),
      nome: `${str(it?.name, 120 - weight.length) || 'Item da 99Food'}${weight}`,
      quantidade,
      // sub-items' value is inside total_price: the pipeline adds adicionais per unit and theirs is 0
      precoUnitario: round2(total / quantidade),
      ...(adicionais.length ? { adicionais: adicionais.slice(0, 30) } : {}),
      ...(str(it?.remark, 200) ? { observacao: str(it.remark, 200) } : {}),
    };
  });
  const subtotal = round2(itens.reduce((s, it) => s + it.precoUnitario * it.quantidade, 0));
  const has = (v: unknown) => v !== undefined && v !== null && v !== '';
  const storeFee = has(price.store_charged_delivery_price)
    ? cents(price.store_charged_delivery_price)
    : round2(cents(price.delivery_price) + cents(price.delivery_discount));
  const taxaEntrega = storeDelivery && !retirada ? storeFee : 0;

  const promos: Array<{ discount: number; store: number }> = (Array.isArray(order?.promotions)
    ? order.promotions
    : (Array.isArray(order?.order_items) ? order.order_items : []).flatMap((it: any) => (Array.isArray(it?.promo_list) ? it.promo_list : [])))
    .map((p: any) => ({ discount: cents(p?.promo_discount), store: cents(p?.shop_subside_price) }))
    .filter((p: { discount: number; store: number }) => p.discount > 0 || p.store > 0);
  const storeShare = round2(promos.reduce((s, p) => s + p.store, 0));
  const cash = payType === 2;
  const form: OrderApiPaymentForm = cash ? 'DINHEIRO' : CHANNEL_FORM[payChannel] ?? 'OUTRO';
  const pago = payMethod === 1 && payType !== 2 && payType !== 3;
  // store delivery and self-pickup are both paid to the store (at the door or at the counter)
  const storePaid = storeDelivery || retirada;

  // The fees 99Food charges the customer (homolog 2026-11-13: service_price 699 inside real_price 18399 = items 185 +
  // delivery 1 - coupon 9 + 6,99). When the store collects the payment, the money comes with them, so they join the
  // order's total (owner, 2026-11-13: "somar no total"); otherwise they are 99Food's and stay out of the sale.
  const fees = price.others_fees ?? {};
  const serviceFee = round2(cents(fees.service_price) + cents(fees.small_order_price));
  const taxaServico = storePaid && !pago ? serviceFee : 0;
  // real_price = what the store receives (incl. delivery and the customer's fees) without the promotions 99Food
  // subsidises; absent on 99Food delivery
  const target = Math.max(0, has(price.real_price)
    ? round2(cents(price.real_price) - serviceFee)
    : round2((has(price.order_price) ? cents(price.order_price) : subtotal) + taxaEntrega - storeShare));
  const desconto = Math.max(0, round2(subtotal + taxaEntrega - target));
  const total = Math.max(0, round2(subtotal + taxaEntrega - desconto + taxaServico));
  // no trocoPara: the kitchen note would compute the change from the store's sale, not from what the customer pays
  const pagamento: OrderApiInput['pagamento'] = { forma: form, pago };

  const a = order?.receive_address ?? {};
  const street = open(a.street_name);
  const entrega = retirada ? undefined : {
    endereco: street || open(a.poi_address) || 'Endereço protegido pela 99Food',
    numero: opt(open(a.street_number, 20)), complemento: opt(open(a.complement)), bairro: opt(open(a.district)),
    cidade: opt(open(a.city, 80)), cep: opt(open(a.postal_code, 10)), referencia: opt(open(a.reference)),
  };

  const virtual = open(a.virtual_phone_number, 30);
  const locator = open(a.locator, 20);
  const masked = open(a.phone, 30);
  const phone = (virtual || masked).replace(/\s/g, '');
  const first = open(a.first_name, 120) || open(a.name, 120);
  const input: OrderApiInput = {
    codigo: orderId,
    cliente: { nome: first || 'Cliente 99Food', celular: phone || '00000000000' },
    ...(entrega ? { entrega } : {}),
    retirada,
    itens,
    taxaEntrega,
    ...(taxaServico > 0 ? { taxaServico } : {}),
    desconto,
    total,
    pagamento,
  };

  const handoverCode = str(order?.handover_code, 20) || null;
  const takeawayCode = str(order?.takeaway_code, 20) || null;
  const shopPaid = price.shop_paid_money;
  const shopPaidMoney = cash && deliveryType === 1 && has(shopPaid) ? cents(shopPaid) : null;
  const needPay = has(price.customer_need_paying_money) ? cents(price.customer_need_paying_money) : has(price.real_pay_price) ? cents(price.real_pay_price) : null;
  const cashToCollect = cash && storePaid ? needPay : null;
  const collect = cashToCollect ?? total;
  const changeFor = cents(order?.change_for);
  const cashLines = !cash ? [] : storePaid ? [
    `Cobrar ${brl(collect)} do cliente`,
    changeFor > 0 ? (changeFor >= collect ? `Troco para ${brl(changeFor)} (levar ${brl(round2(changeFor - collect))})` : `Cliente informou troco para ${brl(changeFor)}`) : '',
  ] : deliveryType === 1 ? [
    shopPaidMoney !== null ? `Receber ${brl(shopPaidMoney)} do entregador` : 'Dinheiro: a 99Food informa o valor quando o entregador for designado',
  ] : [];

  const payLabel = CHANNEL_LABEL[payChannel] ?? (cash ? 'Dinheiro' : 'Outro');
  const lines = [
    `99Food #${orderIndex} · código ${orderId}`,
    retirada ? 'Retirada' : storeDelivery ? 'Entrega própria' : 'Entrega 99Food',
    `Pagamento: ${payLabel} (${pago ? 'pago na 99Food' : 'a cobrar'})`,
    ...cashLines,
    taxaServico > 0 ? `Taxa de serviço da 99Food: ${brl(taxaServico)} (já no total)` : '',
    ...promos.map((p) => {
      const parts = [p.store > 0 ? `${brl(p.store)} pago pela loja` : '', round2(p.discount - p.store) > 0 ? `${brl(round2(p.discount - p.store))} pago pela 99Food` : ''].filter(Boolean);
      return `Promoção ${brl(p.discount)} (${parts.join(', ') || 'pago pela 99Food'})`;
    }),
    handoverCode ? `Código de entrega ${handoverCode}` : '',
    takeawayCode ? `Código de retirada ${takeawayCode}` : '',
    order?.need_cutlery === true ? 'Talheres: sim' : '',
    virtual ? `Ligar para o cliente: ${virtual}${locator ? ` ramal ${locator}` : ''}` : '',
    sanitizeCustomerNote(order?.remark),
  ];

  return {
    input,
    extraNote: lines.filter(Boolean).join('\n'),
    platformData: { orderIndex, orderId, deliveryType, fulfillmentMode, payType, payChannel, handoverCode, takeawayCode, shopPaidMoney, cashToCollect },
  };
}

/**
 * The order's price block for the log, numbers only (no names, phones or addresses): which fees 99Food adds on top of
 * what the store receives (homolog 2026-11-12: total R$ 186,00 but "Cobrar R$ 192,99" on a cash, store-delivery order).
 */
export function priceSummary(order: any): string {
  const keep = (v: unknown, depth: number): unknown => {
    if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return v;
    if (depth < 2 && v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const kept = keep(x, depth + 1);
        if (kept !== undefined) out[k] = kept;
      }
      return out;
    }
    return undefined;
  };
  const head = { delivery_type: order?.delivery_type, fulfillment_mode: order?.fulfillment_mode, pay_type: order?.pay_type, pay_method: order?.pay_method, pay_channel: order?.pay_channel };
  return JSON.stringify({ ...head, price: keep(order?.price ?? {}, 0) });
}
