import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { toCents } from '@/lib/comanda/line-total';
import { createDocumentWithNextNumber } from '@/lib/nfe/numbering';
import { resolveItemsFiscalData } from '@/lib/nfe/fiscal-data';
import { recordEmitResult } from '@/lib/nfe/emit-session';
import type { NFeEmitPayload } from '@/lib/nfe/types';

/**
 * A stand-alone NFC-e typed by a manager on /admin/fiscal (a sale made outside a comanda).
 * It used to declare every item under NCM 21069090 / CFOP 5102, mark the note "authorized" with a
 * made-up access key in homologation and never send anything in production. It now follows the
 * comanda rules (lib/nfe/emit-session.ts):
 * - each item's fiscal data comes from the chosen product, else the restaurant defaults; missing
 *   data refuses the note BEFORE a number is reserved (422 FISCAL_DATA_MISSING);
 * - the number is reserved atomically with the insert (lib/nfe/numbering.ts);
 * - the note is really sent through the restaurant's provider (the mock only in homologation
 *   without NFE_FORCE_REAL, lib/nfe/provider.ts) and its answer stored as-is;
 * - a rejection or unknown outcome leaves an alert; a rejected note is re-sent from its page
 *   (/api/nfe/documents/[id]/submit) under the same number.
 * NF-e (model 55, company buyer) is not issued here: it needs the buyer's full registration.
 */

export interface StandaloneItemInput {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  recipeId?: string | null;
}

export interface StandaloneInput {
  restaurantId: string;
  items: StandaloneItemInput[];
  customerCPF?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  paymentMethod?: string | null;
}

export interface StandaloneOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

export const STANDALONE_PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao de credito', 'cartao de debito'] as const;

const MAX_ITEMS = 100;

const digitsOrNull = (value?: string | null) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
};

export async function emitStandaloneNFCe(input: StandaloneInput): Promise<StandaloneOutcome> {
  const { restaurantId } = input;
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) return { httpStatus: 400, body: { error: 'Inclua pelo menos um item' } };
  if (rawItems.length > MAX_ITEMS) return { httpStatus: 400, body: { error: `No máximo ${MAX_ITEMS} itens por nota` } };

  // Quantities with up to 3 decimals (kg), prices in whole cents, both positive
  const parsed = rawItems.map((item) => ({
    description: String(item.description ?? '').trim(),
    quantity: Math.round(Number(item.quantity) * 1000) / 1000,
    unitCents: toCents(Number(item.unitPrice)),
    recipeId: item.recipeId ? String(item.recipeId) : null,
  }));
  const invalid = parsed.findIndex(
    (i) => !i.description || !Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitCents) || i.unitCents <= 0
  );
  if (invalid >= 0) {
    return { httpStatus: 400, body: { error: `Item ${invalid + 1}: informe descrição, quantidade e preço maiores que zero` } };
  }

  const paymentMethod = String(input.paymentMethod || 'dinheiro');
  if (!(STANDALONE_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    return { httpStatus: 400, body: { error: 'Forma de pagamento inválida' } };
  }

  const customerCPF = digitsOrNull(input.customerCPF);
  if (customerCPF && customerCPF.length !== 11) {
    return { httpStatus: 400, body: { error: 'CPF do cliente deve ter 11 dígitos (CNPJ só em NF-e)' } };
  }

  const config = await prisma.nFeConfig.findFirst({ where: { restaurantId, active: true } });
  if (!config) return { httpStatus: 400, body: { error: 'Configuração fiscal não encontrada ou inativa' } };

  // Products only from this restaurant: another restaurant's product is refused, never used
  const recipeIds = [...new Set(parsed.map((i) => i.recipeId).filter(Boolean))] as string[];
  const recipes = recipeIds.length
    ? await prisma.recipe.findMany({
        where: { id: { in: recipeIds }, restaurantId },
        select: { id: true, name: true, fiscalNcm: true, fiscalCest: true, fiscalCfop: true, fiscalOrigin: true, fiscalCsosn: true },
      })
    : [];
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  if (recipeIds.some((id) => !recipeById.has(id))) {
    return { httpStatus: 400, body: { error: 'Produto não encontrado neste restaurante' } };
  }

  const fiscal = resolveItemsFiscalData(
    config,
    parsed.map((i) => {
      const recipe = i.recipeId ? recipeById.get(i.recipeId) : null;
      return { ...(recipe ?? {}), name: i.description };
    })
  );
  if (!fiscal.ok) {
    return { httpStatus: 422, body: { error: fiscal.reason, code: 'FISCAL_DATA_MISSING', products: fiscal.products } };
  }

  const lines = parsed.map((item, idx) => {
    const totalCents = Math.round(item.unitCents * item.quantity);
    return {
      description: item.description.slice(0, 120),
      quantity: item.quantity,
      unit: 'UN',
      unitPrice: item.unitCents / 100,
      totalPrice: totalCents / 100,
      ncm: fiscal.items[idx].ncm,
      cfop: fiscal.items[idx].cfop,
      recipeId: item.recipeId,
      position: idx,
    };
  });
  const totalAmount = lines.reduce((sum, line) => sum + Math.round(line.totalPrice * 100), 0) / 100;

  const customer = {
    customerCPF,
    customerName: input.customerName?.trim() || null,
    customerEmail: input.customerEmail?.trim() || null,
  };

  const document = await createDocumentWithNextNumber({
    configId: config.id,
    documentType: 'NFCe',
    data: {
      providerRef: `nfce-avulsa-${crypto.randomBytes(6).toString('hex')}-${Date.now()}`,
      ...customer,
      issueDate: new Date(),
      totalAmount,
      status: 'pending',
      items: { create: lines },
    },
    include: { items: true },
  });

  const provider = getProvider(config);
  const payload: NFeEmitPayload = {
    providerRef: document.providerRef!,
    documentType: 'NFCe',
    cnpj: config.cnpj,
    uf: config.uf || 'SP',
    series: document.documentSeries,
    number: document.documentNumber,
    environment: (config.environment as 'sandbox' | 'production') || 'sandbox',
    customerCPF: customer.customerCPF || undefined,
    customerName: customer.customerName || undefined,
    customerEmail: customer.customerEmail || undefined,
    items: lines.map((line, idx) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
      ncm: fiscal.items[idx].ncm,
      cfop: fiscal.items[idx].cfop,
      cest: fiscal.items[idx].cest,
      icmsOrigin: fiscal.items[idx].origin,
      icmsCST: fiscal.items[idx].csosn,
    })),
    totalAmount,
    paymentMethod,
    paymentAmount: totalAmount,
    pisCofinsCst: config.pisCofinsCst || undefined,
  };

  await prisma.nFeLog.create({
    data: {
      configId: config.id,
      documentId: document.id,
      eventType: 'submit',
      description: `Emitindo NFC-e avulsa nº ${document.documentNumber} via ${provider.name}`,
      requestData: JSON.stringify(payload).slice(0, 4000),
    },
  });

  const result = await provider.emitNFCe(payload);
  const updated = await recordEmitResult(document.id, config.id, payload, result, restaurantId);

  return {
    httpStatus: 201,
    body: {
      success: result.ok,
      status: updated.status,
      rejectionReason: result.rejectionReason,
      document: updated,
    },
  };
}
