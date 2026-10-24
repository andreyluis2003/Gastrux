import { normalizePhone } from '@/lib/cashback/rules';
import { singleLine } from '@/lib/delivery-payments/order-input';

/**
 * The body of the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 3). Every error names the field in
 * Portuguese, so whoever integrates finds it without asking.
 */
export type OrderApiPaymentForm = 'PIX' | 'CREDITO' | 'DEBITO' | 'DINHEIRO' | 'VALE_REFEICAO' | 'OUTRO';
export interface OrderApiInput {
  codigo: string;
  cliente: { nome: string; celular: string; email?: string };
  entrega?: { endereco: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; cep?: string; referencia?: string };
  retirada: boolean;
  itens: Array<{ codigo?: string; nome: string; quantidade: number; precoUnitario: number; adicionais?: Array<{ nome: string; preco: number }>; observacao?: string }>;
  taxaEntrega: number;
  desconto: number;
  total: number;
  pagamento: { forma: OrderApiPaymentForm; pago: boolean; trocoPara?: number };
  agendadoPara?: Date;
  observacao?: string;
}

const FORMS: OrderApiPaymentForm[] = ['PIX', 'CREDITO', 'DEBITO', 'DINHEIRO', 'VALE_REFEICAO', 'OUTRO'];
const MAX_MONEY = 100_000;

class Bad extends Error {}
const fail = (field: string, message: string): never => { throw new Bad(`${field}: ${message}`); };
const text = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? singleLine(v).trim().slice(0, max) : '');
const optText = (v: unknown, max: number) => text(v, max) || undefined;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

function money(v: unknown, field: string, optional = false): number {
  if ((v === undefined || v === null) && optional) return 0;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_MONEY) fail(field, 'deve ser um valor em reais, de 0 a 100000');
  return Math.round((v as number) * 100) / 100;
}

function parse(body: any): OrderApiInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('pedido', 'envie um objeto JSON');
  const codigo = text(body.codigo, 80);
  if (!codigo) fail('codigo', 'informe o código do pedido no seu sistema');

  const c = body.cliente ?? {};
  const nome = text(c.nome, 120);
  if (!nome) fail('cliente.nome', 'informe o nome do cliente');
  const celular = normalizePhone(c.celular);
  if (!celular) fail('cliente.celular', 'informe DDD e número, como (11) 98888-7777');
  const email = optText(c.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('cliente.email', 'e-mail inválido');

  const retirada = body.retirada === true;
  let entrega: OrderApiInput['entrega'];
  if (!retirada) {
    const e = body.entrega ?? {};
    const endereco = text(e.endereco, 200);
    if (!endereco) fail('entrega.endereco', 'informe o endereço, ou mande "retirada": true');
    entrega = { endereco, numero: optText(e.numero, 20), complemento: optText(e.complemento, 80), bairro: optText(e.bairro, 80), cidade: optText(e.cidade, 80), cep: optText(e.cep, 12), referencia: optText(e.referencia, 120) };
  }

  if (!Array.isArray(body.itens) || body.itens.length === 0 || body.itens.length > 100) fail('itens', 'envie de 1 a 100 itens');
  const itens = (body.itens as any[]).map((it, i) => {
    const f = `itens[${i + 1}]`;
    const nomeItem = text(it?.nome, 120);
    if (!nomeItem) fail(`${f}.nome`, 'informe o nome do item');
    const quantidade = it?.quantidade;
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) fail(`${f}.quantidade`, 'deve ser um número inteiro de 1 a 99');
    const precoUnitario = money(it?.precoUnitario, `${f}.precoUnitario`);
    let adicionais: Array<{ nome: string; preco: number }> | undefined;
    if (it?.adicionais !== undefined) {
      if (!Array.isArray(it.adicionais) || it.adicionais.length > 30) fail(`${f}.adicionais`, 'envie uma lista de até 30 adicionais');
      adicionais = it.adicionais.map((ad: any, j: number) => {
        const nomeAd = text(ad?.nome, 80);
        if (!nomeAd) fail(`${f}.adicionais[${j + 1}].nome`, 'informe o nome do adicional');
        return { nome: nomeAd, preco: money(ad?.preco, `${f}.adicionais[${j + 1}].preco`, true) };
      });
    }
    return { codigo: optText(it?.codigo, 60), nome: nomeItem, quantidade, precoUnitario, adicionais, observacao: optText(it?.observacao, 200) };
  });

  const taxaEntrega = money(body.taxaEntrega, 'taxaEntrega', true);
  const desconto = money(body.desconto, 'desconto', true);
  const total = money(body.total, 'total');
  const itemsCents = itens.reduce((sum, it) => sum + Math.round((it.precoUnitario + (it.adicionais ?? []).reduce((a, ad) => a + ad.preco, 0)) * 100) * it.quantidade, 0);
  const expected = (itemsCents + Math.round(taxaEntrega * 100) - Math.round(desconto * 100)) / 100;
  if (expected < 0) fail('desconto', 'é maior que o pedido');
  if (Math.abs(expected - total) > 0.01) fail('total', `não confere com os itens (esperado ${brl(expected)})`);

  const p = body.pagamento ?? {};
  if (!FORMS.includes(p.forma)) fail('pagamento.forma', `use ${FORMS.join(', ')}`);
  if (typeof p.pago !== 'boolean') fail('pagamento.pago', 'diga se o pedido já foi pago (true ou false)');
  const trocoPara = p.trocoPara === undefined || p.trocoPara === null ? undefined : money(p.trocoPara, 'pagamento.trocoPara');
  if (trocoPara !== undefined && trocoPara < total) fail('pagamento.trocoPara', 'é menor que o total');

  let agendadoPara: Date | undefined;
  if (body.agendadoPara !== undefined && body.agendadoPara !== null) {
    const d = typeof body.agendadoPara === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(body.agendadoPara) ? new Date(body.agendadoPara) : null;
    if (!d || Number.isNaN(d.getTime())) fail('agendadoPara', 'use data e hora ISO, como 2026-10-24T19:30:00-03:00');
    const now = Date.now();
    if (d!.getTime() < now - 5 * 60e3 || d!.getTime() > now + 30 * 864e5) fail('agendadoPara', 'deve ser no futuro, em até 30 dias');
    agendadoPara = d!;
  }

  return {
    codigo, cliente: { nome, celular: celular!, ...(email ? { email } : {}) }, ...(entrega ? { entrega } : {}), retirada, itens,
    taxaEntrega, desconto, total, pagamento: { forma: p.forma, pago: p.pago, ...(trocoPara !== undefined ? { trocoPara } : {}) },
    ...(agendadoPara ? { agendadoPara } : {}), ...(optText(body.observacao, 500) ? { observacao: optText(body.observacao, 500) } : {}),
  };
}

export function parseOrderApiInput(body: unknown): { ok: true; value: OrderApiInput } | { ok: false; error: string } {
  try {
    return { ok: true, value: parse(body) };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}
