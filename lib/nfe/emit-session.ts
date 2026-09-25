import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/nfe/provider';
import { lineTotalCents, toCents } from '@/lib/comanda/line-total';
import { createDocumentWithNextNumber, findReusableRejected } from '@/lib/nfe/numbering';
import type { NFeEmitPayload, NFeEmitResult } from '@/lib/nfe/types';

/**
 * Issues the NFC-e of one comanda (OrderSession). Shared by the manual button (/api/nfe/emit),
 * /api/nfe/auto-emit and the automatic emission when a comanda is closed, so they follow the same
 * rules:
 * - the note declares what the customer was charged (lib/comanda/line-total.ts);
 * - a comanda gets at most one live note (authorized / submitted / processing: 409);
 * - a rejected note of the comanda is corrected and re-sent under its own number and provider ref
 *   (a new number is reserved atomically only when there is none, lib/nfe/numbering.ts);
 * - an unknown provider outcome stays "processing"; a denied note keeps its (used) number;
 * - a rejection, denial or unknown outcome leaves an alert for the restaurant.
 */

export interface EmitSessionInput {
  restaurantId: string;
  orderSessionId: string;
  customerCPF?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  paymentMethod?: string | null;
}

export interface EmitSessionOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

const LIVE_STATUSES = ['authorized', 'submitted', 'processing'];

class NoteAlreadyInFlight extends Error {
  constructor(readonly document: { id: string; status: string; accessKey: string | null }) {
    super('fiscal note already in flight for this comanda');
  }
}

const digitsOrNull = (value?: string | null) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
};

export async function emitNFCeForSession(input: EmitSessionInput): Promise<EmitSessionOutcome> {
  const { restaurantId, orderSessionId } = input;

  // Scoped to the caller's restaurant: never emit a note for another restaurant's comanda
  const orderSession = await prisma.orderSession.findFirst({
    where: { id: orderSessionId, restaurantId },
    include: { items: { include: { recipe: true, modifiers: { select: { priceAdjustment: true } } } } },
  });
  if (!orderSession) return { httpStatus: 404, body: { error: 'Comanda não encontrada' } };
  if (!orderSession.items?.length) return { httpStatus: 400, body: { error: 'Comanda sem itens' } };

  const live = await prisma.nFeDocument.findFirst({
    where: { orderSessionId, status: { in: LIVE_STATUSES } },
  });
  if (live) {
    return {
      httpStatus: 409,
      body: { error: 'Já existe NFC-e emitida para esta comanda', documentId: live.id, accessKey: live.accessKey, status: live.status },
    };
  }

  // One config per restaurant: never emit under another restaurant's CNPJ
  const config = await prisma.nFeConfig.findFirst({ where: { restaurantId, active: true } });
  if (!config) {
    return { httpStatus: 400, body: { error: 'NFeConfig não configurada. Configure em /admin/nfe/config' } };
  }

  const lines = orderSession.items.map((item, idx) => {
    const adjustments = item.modifiers.map((m) => m.priceAdjustment);
    const unitCents = toCents(item.price) + adjustments.reduce<number>((sum, adj) => sum + toCents(adj), 0);
    const totalCents = lineTotalCents(item.price, item.quantity, adjustments);
    return {
      description: item.recipe?.name || 'Produto',
      quantity: item.quantity,
      unit: 'UN',
      unitPrice: unitCents / 100,
      totalPrice: totalCents / 100,
      ncm: '21069090',
      cfop: '5102',
      recipeId: item.recipeId,
      position: idx,
    };
  });
  const totalAmount = lines.reduce((sum, line) => sum + Math.round(line.totalPrice * 100), 0) / 100;

  const reusable = await findReusableRejected(orderSessionId);
  const previous = (reusable?.dataSnapshot ?? {}) as Partial<NFeEmitPayload>;
  const customer = {
    customerCPF: digitsOrNull(input.customerCPF) ?? reusable?.customerCPF ?? null,
    customerName: input.customerName || reusable?.customerName || null,
    customerEmail: input.customerEmail || reusable?.customerEmail || null,
  };
  const paymentMethod = input.paymentMethod || previous.paymentMethod || 'dinheiro';

  // Two clicks (or the close hook and the button) at once must not issue two notes: the check
  // runs again under a per-comanda lock, in the transaction that reserves or reuses the number.
  // A "pending" note is an emission in flight (or interrupted: re-send it from its page).
  const lockSale = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nfe-session:${orderSessionId}`}))`;
    const inFlight = await tx.nFeDocument.findFirst({
      where: { orderSessionId, status: { in: [...LIVE_STATUSES, 'pending'] } },
    });
    if (inFlight) throw new NoteAlreadyInFlight(inFlight);
  };

  let document;
  try {
    document = reusable
    ? await prisma.$transaction(async (tx) => {
        await lockSale(tx);
        await tx.nFeItem.deleteMany({ where: { documentId: reusable.id } });
        return tx.nFeDocument.update({
          where: { id: reusable.id },
          data: {
            ...customer,
            totalAmount,
            issueDate: new Date(),
            status: 'pending',
            rejectionReason: null,
            statusDescription: null,
            items: { create: lines },
          },
          include: { items: true },
        });
      })
    : await createDocumentWithNextNumber({
        configId: config.id,
        documentType: 'NFCe',
        data: {
          orderSessionId,
          providerRef: `nfce-${orderSessionId.slice(-10)}-${Date.now()}`,
          ...customer,
          issueDate: new Date(),
          totalAmount,
          status: 'pending',
          items: { create: lines },
        },
        include: { items: true },
        guard: lockSale,
      });
  } catch (error) {
    if (!(error instanceof NoteAlreadyInFlight)) throw error;
    const doc = error.document;
    return {
      httpStatus: 409,
      body: {
        error: doc.status === 'pending' ? 'Emissão desta comanda já em andamento' : 'Já existe NFC-e emitida para esta comanda',
        documentId: doc.id,
        accessKey: doc.accessKey,
        status: doc.status,
      },
    };
  }

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
    items: document.items.map((it) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unit: it.unit,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
      ncm: it.ncm || undefined,
      cfop: it.cfop || undefined,
    })),
    totalAmount,
    paymentMethod,
    paymentAmount: totalAmount,
  };

  await prisma.nFeLog.create({
    data: {
      configId: config.id,
      documentId: document.id,
      eventType: 'submit',
      description: reusable
        ? `Reenviando NFC-e rejeitada nº ${document.documentNumber} via ${provider.name}`
        : `Emitindo NFC-e nº ${document.documentNumber} via ${provider.name}`,
      requestData: JSON.stringify(payload).slice(0, 4000),
    },
  });

  const result = await provider.emitNFCe(payload);
  const updated = await recordEmitResult(document.id, config.id, payload, result, restaurantId);

  return {
    httpStatus: 200,
    body: {
      success: result.ok,
      document: updated,
      status: updated.status,
      accessKey: result.accessKey,
      qrCodeData: result.qrCodeData,
      qrCodeUrl: result.qrCodeUrl,
      danfeUrl: result.danfeUrl,
      rejectionReason: result.rejectionReason,
    },
  };
}

/**
 * Stores a provider answer on the document (and in its log). Shared with the re-send route
 * (/api/nfe/documents/[id]/submit). Raises the restaurant alert when the note did not go through.
 */
export async function recordEmitResult(
  documentId: string,
  configId: string,
  payload: NFeEmitPayload,
  result: NFeEmitResult,
  restaurantId: string
) {
  const data: Record<string, unknown> = { dataSnapshot: payload as any, submittedAt: new Date() };
  if (result.ok) {
    Object.assign(data, {
      status: result.status,
      accessKey: result.accessKey || null,
      protocolNumber: result.protocolNumber || null,
      qrCodeData: result.qrCodeData || null,
      qrCodeUrl: result.qrCodeUrl || null,
      pdfUrl: result.danfeUrl || null,
      xmlUrl: result.xmlUrl || null,
      statusDescription: result.statusDescription || null,
      rejectionReason: null,
      ...(result.status === 'authorized' ? { authorizedAt: new Date() } : {}),
    });
  } else if (result.status === 'processing') {
    // Unknown outcome (timeout, 5xx): the note may be authorised. Keep it in processing so this
    // sale cannot be emitted again before its status is checked on the same ref
    Object.assign(data, {
      status: 'processing',
      statusDescription: result.rejectionReason || result.statusDescription || null,
    });
  } else {
    Object.assign(data, {
      status: result.status === 'denied' ? 'denied' : 'rejected',
      rejectionReason: result.rejectionReason || 'Erro na emissão',
      statusDescription: result.statusDescription || null,
    });
  }

  const updated = await prisma.nFeDocument.update({
    where: { id: documentId },
    data,
    include: { items: true },
  });

  await prisma.nFeLog.create({
    data: {
      configId,
      documentId,
      eventType: result.ok ? 'emit_success' : 'emit_error',
      description: result.ok ? `Emitido com status: ${result.status}` : `Erro: ${result.rejectionReason}`,
      responseData: JSON.stringify(result.raw || {}).slice(0, 4000),
      statusCode: result.ok ? 200 : 400,
      errorMessage: result.ok ? null : result.rejectionReason,
    },
  });

  if (!result.ok) await alertFiscalProblem(restaurantId, updated);
  return updated;
}

const ALERT_TEXT: Record<string, { title: string; message: string }> = {
  rejected: {
    title: 'NFC-e rejeitada',
    message: 'A SEFAZ rejeitou a nota. A venda foi mantida: corrija o dado indicado e reenvie a nota (o mesmo número é reaproveitado).',
  },
  denied: {
    title: 'NFC-e denegada',
    message: 'A SEFAZ denegou a nota (problema cadastral). O número foi consumido e não pode ser reaproveitado: fale com o contador.',
  },
  processing: {
    title: 'NFC-e sem resposta',
    message: 'O provedor fiscal não respondeu. A nota pode ter sido autorizada: consulte o status antes de emitir de novo.',
  },
};

/** One alert per note and outcome. Never throws: the sale must not fail because of the alert. */
async function alertFiscalProblem(
  restaurantId: string,
  doc: { id: string; status: string; documentNumber: number; documentSeries: number; rejectionReason: string | null; orderSessionId: string | null }
) {
  const text = ALERT_TEXT[doc.status];
  if (!text) return;
  try {
    const dedupeKey = `nfe-${doc.status}:${doc.id}`;
    const existing = await prisma.notification.findFirst({
      where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey }, read: false },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_ERROR',
        severity: doc.status === 'processing' ? 'HIGH' : 'CRITICAL',
        title: `${text.title} (nº ${doc.documentNumber}, série ${doc.documentSeries})`,
        message: doc.rejectionReason ? `${text.message} Motivo: ${doc.rejectionReason}` : text.message,
        actionUrl: `/admin/nfe/documents/${doc.id}`,
        actionLabel: 'Ver nota',
        data: { kind: 'nfe_problem', status: doc.status, dedupeKey, documentId: doc.id, orderSessionId: doc.orderSessionId },
      },
    });
  } catch (error) {
    console.error('Could not store the fiscal note alert:', error);
  }
}

export interface AutoEmitSummary {
  emitted: boolean;
  message: string;
  nfce: { id: string; number: number; series: number; status: string; accessKey: string | null; rejectionReason: string | null } | null;
}

/**
 * Automatic emission when a sale closes. Never throws and never fails the sale: every problem is
 * returned as a message (and a rejection / unknown outcome also leaves an alert, see recordEmitResult).
 * With `onlyIfEnabled`, does nothing unless the restaurant turned on NFeConfig.autoIssueOnSale.
 */
export async function autoEmitNFCe(
  input: EmitSessionInput & { onlyIfEnabled?: boolean }
): Promise<AutoEmitSummary> {
  try {
    const config = await prisma.nFeConfig.findFirst({
      where: { restaurantId: input.restaurantId, active: true },
      select: { autoIssueOnSale: true },
    });
    if (!config) return { emitted: false, nfce: null, message: 'NFC-e não configurada. Venda registrada sem nota fiscal.' };
    // A plan downgrade after the fiscal setup must not break the sale: the same graceful answer
    // as "not configured", never a hard refusal (rule from /api/nfe/auto-emit)
    const { isTierFeatureEnabled } = await import('@/lib/tier-guard');
    const restaurant = await prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: { subscriptionTier: true } });
    if (!isTierFeatureEnabled(restaurant?.subscriptionTier || 'starter', 'nfe')) {
      return { emitted: false, nfce: null, message: 'NF-e não disponível no plano atual. Venda registrada sem nota fiscal.' };
    }
    if (input.onlyIfEnabled && !config.autoIssueOnSale) {
      return { emitted: false, nfce: null, message: 'Emissão automática de NFC-e desligada nas configurações.' };
    }

    const outcome = await emitNFCeForSession(input);
    const doc = outcome.body.document as any;
    if (outcome.httpStatus === 409) {
      return { emitted: false, nfce: null, message: 'NFC-e já emitida para esta comanda.' };
    }
    if (!doc) {
      return { emitted: false, nfce: null, message: `Venda registrada. NFC-e não emitida: ${outcome.body.error}` };
    }
    const nfce = {
      id: doc.id,
      number: doc.documentNumber,
      series: doc.documentSeries,
      status: doc.status,
      accessKey: doc.accessKey ?? null,
      rejectionReason: doc.rejectionReason ?? null,
    };
    const message =
      doc.status === 'authorized' ? 'NFC-e emitida com sucesso.'
      : doc.status === 'processing' ? 'Venda registrada. NFC-e em processamento: o status será conferido antes de reemitir.'
      : `Venda registrada. NFC-e ${doc.status === 'denied' ? 'denegada' : 'rejeitada'}: ${doc.rejectionReason ?? 'motivo não informado'}. O gerente foi alertado.`;
    return { emitted: doc.status === 'authorized', nfce, message };
  } catch (error: any) {
    console.error('[NFC-e auto] emission failed:', error);
    return { emitted: false, nfce: null, message: `Venda registrada. Erro na emissão de NFC-e: ${error?.message || 'erro desconhecido'}` };
  }
}
