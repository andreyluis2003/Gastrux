import type { OrderApiInput, OrderApiPaymentForm } from '@/lib/delivery-orders/input';
import { sanitizeCustomerNote, singleLine } from '@/lib/delivery-payments/order-input';

/**
 * An iFood order (GET /order/v1.0/orders/{id}) as the input of the order pipeline (plan 2026-10-24 ifood, Task 3), plus
 * the ticket lines the iFood homologation asks for (card brand, change, coupons and who pays them, pickup code, CPF/CNPJ).
 * Sale value: items + options, + delivery fee only when the store delivers, − the coupons the store pays.
 */
const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown, max = 200) => (typeof v === 'string' || typeof v === 'number' ? singleLine(String(v)).trim().slice(0, max) : '');
const opt = (v: unknown, max = 200) => str(v, max) || undefined;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

const FORM: Record<string, OrderApiPaymentForm> = {
  CREDIT: 'CREDITO', DEBIT: 'DEBITO', PIX: 'PIX', CASH: 'DINHEIRO', MEAL_VOUCHER: 'VALE_REFEICAO', FOOD_VOUCHER: 'VALE_REFEICAO',
};
const METHOD_LABEL: Record<string, string> = {
  CREDIT: 'Crédito', DEBIT: 'Débito', PIX: 'PIX', CASH: 'Dinheiro', MEAL_VOUCHER: 'Vale-refeição', FOOD_VOUCHER: 'Vale-alimentação', DIGITAL_WALLET: 'Carteira digital',
};

export interface IfoodPlatformData {
  displayId: string;
  orderType: string;
  deliveredBy: string | null;
  pickupCode: string | null;
}

export function mapIfoodOrder(order: any): { input: OrderApiInput; extraNote: string; platformData: IfoodPlatformData; externalCustomerId: string | null } {
  const orderType = str(order?.orderType) || 'DELIVERY';
  const isDelivery = orderType === 'DELIVERY';
  const deliveredBy = isDelivery ? str(order?.delivery?.deliveredBy) || null : null;
  const ownDelivery = deliveredBy === 'MERCHANT';

  const itens: OrderApiInput['itens'] = (Array.isArray(order?.items) ? order.items : []).map((it: any) => {
    const quantidade = Math.max(1, Math.round(num(it?.quantity)) || 1);
    const total = num(it?.totalPrice) || num(it?.price) + num(it?.optionsPrice);
    const adicionais = (Array.isArray(it?.options) ? it.options : [])
      .map((o: any) => ({ nome: `${Math.max(1, Math.round(num(o?.quantity)) || 1)}x ${str(o?.name, 80)}`, preco: 0 }))
      .filter((o: { nome: string }) => o.nome.length > 3);
    return {
      codigo: opt(it?.externalCode, 60),
      nome: str(it?.name, 120) || 'Item do iFood',
      quantidade,
      // the options' price is inside: the pipeline adds the adicionais' price per unit, and theirs is 0
      precoUnitario: round2(total / quantidade),
      ...(adicionais.length ? { adicionais } : {}),
      ...(typeof it?.observations === 'string' && it.observations.trim() ? { observacao: it.observations } : {}),
    };
  });
  const subtotal = round2(itens.reduce((s, it) => s + it.precoUnitario * it.quantidade, 0));

  const benefits = Array.isArray(order?.benefits) ? order.benefits : [];
  const shares = benefits.flatMap((b: any) => (Array.isArray(b?.sponsorshipValues) ? b.sponsorshipValues : []))
    .map((s: any) => ({ by: str(s?.name), value: round2(num(s?.value)) }))
    .filter((s: { value: number }) => s.value > 0);
  const desconto = round2(shares.filter((s: { by: string }) => s.by === 'MERCHANT').reduce((a: number, s: { value: number }) => a + s.value, 0));
  const taxaEntrega = ownDelivery ? round2(num(order?.total?.deliveryFee)) : 0;

  const methods = Array.isArray(order?.payments?.methods) ? order.payments.methods : [];
  const main = methods.find((m: any) => m?.type === 'OFFLINE') ?? methods[0];
  const changeFor = main?.method === 'CASH' ? num(main?.cash?.changeFor) : 0;
  // The change comes from what the customer pays (the cash method's value: with iFood's service fee, without iFood's
  // coupons), not from the restaurant's total, so it is a ticket line here and not trocoPara (final review I3)
  const changeLine = changeFor > 0 ? `Troco para ${brl(changeFor)}: levar ${brl(round2(changeFor - num(main?.value)))}` : '';
  const pagamento: OrderApiInput['pagamento'] = {
    forma: FORM[str(main?.method)] ?? 'OUTRO',
    pago: num(order?.payments?.pending) === 0,
    trocoPara: undefined,
  };

  const a = order?.delivery?.deliveryAddress ?? {};
  const entrega = isDelivery
    ? {
      endereco: str(a.streetName) || str(a.formattedAddress) || 'Endereço no iFood',
      numero: opt(a.streetNumber, 20), complemento: opt(a.complement), bairro: opt(a.neighborhood),
      cidade: opt(a.city, 80), cep: opt(a.postalCode, 10), referencia: opt(a.reference),
    }
    : undefined;

  const phone = order?.customer?.phone ?? {};
  const input: OrderApiInput = {
    codigo: str(order?.id, 80),
    cliente: { nome: str(order?.customer?.name, 120) || 'Cliente iFood', celular: str(phone.number).replace(/\D/g, '') || '00000000000' },
    ...(entrega ? { entrega } : {}),
    retirada: !isDelivery,
    itens,
    taxaEntrega,
    desconto,
    total: round2(subtotal + taxaEntrega - desconto),
    pagamento,
    ...(order?.orderTiming === 'SCHEDULED' && order?.schedule?.deliveryDateTimeStart ? { agendadoPara: new Date(order.schedule.deliveryDateTimeStart) } : {}),
  };

  const displayId = str(order?.displayId, 20) || input.codigo.slice(-6);
  const pickupCode = str(order?.pickupCode ?? order?.delivery?.pickupCode, 20) || null;
  const doc = str(order?.customer?.documentNumber, 20);
  const lines = [
    `iFood #${displayId}`,
    !isDelivery ? 'Retirada' : ownDelivery ? 'Entrega própria' : 'Entrega iFood',
    pickupCode ? `Código de retirada: ${pickupCode}` : '',
    ...methods.map((m: any) => {
      const label = [METHOD_LABEL[str(m?.method)] ?? (str(m?.method) || 'Outro'), str(m?.card?.brand, 30)].filter(Boolean).join(' ');
      return `Pagamento: ${label} (${m?.type === 'ONLINE' ? 'pago no iFood' : 'a cobrar'}) ${brl(round2(num(m?.value)))}`;
    }),
    changeLine,
    ...shares.map((s: { by: string; value: number }) => `Cupom ${brl(s.value)} (${s.by === 'MERCHANT' ? 'pago pela loja' : s.by === 'IFOOD' ? 'pago pelo iFood' : `pago por ${s.by || 'parceiro'}`})`),
    doc ? `CPF/CNPJ na nota: ${doc}` : '',
    str(phone.number) ? `Telefone iFood: ${str(phone.number, 30)}${str(phone.localizer) ? ` (código ${str(phone.localizer, 20)})` : ''}` : '',
    sanitizeCustomerNote(order?.delivery?.observations),
    sanitizeCustomerNote(order?.extraInfo),
  ];

  return {
    input,
    extraNote: lines.filter(Boolean).join('\n'),
    platformData: { displayId, orderType, deliveredBy, pickupCode },
    externalCustomerId: str(order?.customer?.id, 80) || null,
  };
}
