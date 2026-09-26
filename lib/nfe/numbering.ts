import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Fiscal note numbering. SEFAZ rules followed here:
 * - a number is used ONCE per emitter, model (NFCe = 65, NFe = 55) and series (unique index
 *   nfe_documents_number_key);
 * - a REJECTED note did not use its number: it is corrected and re-sent under the same number
 *   (see findReusableRejected);
 * - a DENIED note ("denegada") did use its number, which is never reused;
 * - a number left unused (a gap, or a rejected note nobody re-sent) must be voided at SEFAZ
 *   ("inutilização"), usually by the 10th of the following month (see listNumbersToVoid).
 */

export type FiscalDocumentType = 'NFCe' | 'NFe';

const counterField = (type: FiscalDocumentType) => (type === 'NFCe' ? 'nextNumberNFCe' : 'nextNumberNFe');
const seriesField = (type: FiscalDocumentType) => (type === 'NFCe' ? 'seriesNFCe' : 'seriesNFe');

const MAX_ATTEMPTS = 3;

function isNumberTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Creates a fiscal document under the next free number of its series. The counter is incremented
 * inside the same transaction as the insert: the UPDATE locks the config row, so concurrent sales
 * are serialised, and a failed insert gives the number back. If the counter lags behind a number
 * already used (manual edit, legacy data), it is moved past the highest used number and the insert
 * retried, instead of issuing a duplicate.
 */
export async function createDocumentWithNextNumber<T extends Prisma.NFeDocumentInclude>(args: {
  configId: string;
  documentType: FiscalDocumentType;
  data: Omit<Prisma.NFeDocumentUncheckedCreateInput, 'configId' | 'documentType' | 'documentNumber' | 'documentSeries'>;
  include?: T;
  /** Runs first inside the transaction (e.g. lock the sale and refuse a second live note); may throw. */
  guard?: (tx: Prisma.TransactionClient) => Promise<void>;
}) {
  const { configId, documentType, data, include, guard } = args;
  const counter = counterField(documentType);

  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (guard) await guard(tx);
        const config = await tx.nFeConfig.update({
          where: { id: configId },
          data: { [counter]: { increment: 1 } },
          select: { nextNumberNFCe: true, nextNumberNFe: true, seriesNFCe: true, seriesNFe: true },
        });
        const documentNumber = config[counter] - 1;
        const documentSeries = config[seriesField(documentType)];
        return tx.nFeDocument.create({
          data: { ...data, configId, documentType, documentNumber, documentSeries },
          include,
        }) as unknown as Prisma.NFeDocumentGetPayload<{ include: T }>;
      });
    } catch (error) {
      if (!isNumberTaken(error) || attempt >= MAX_ATTEMPTS) throw error;
      await moveCounterPastUsedNumbers(configId, documentType);
    }
  }
}

async function moveCounterPastUsedNumbers(configId: string, documentType: FiscalDocumentType) {
  const config = await prisma.nFeConfig.findUniqueOrThrow({ where: { id: configId } });
  const series = config[seriesField(documentType)];
  const highest = await prisma.nFeDocument.aggregate({
    where: { configId, documentType, documentSeries: series },
    _max: { documentNumber: true },
  });
  const next = (highest._max.documentNumber ?? 0) + 1;
  // Only ever moves forward (another request may have moved it already)
  await prisma.nFeConfig.updateMany({
    where: { id: configId, [counterField(documentType)]: { lt: next } },
    data: { [counterField(documentType)]: next },
  });
}

/**
 * The rejected note of this comanda that can be corrected and re-sent under its own number,
 * or null. Only a plain rejection qualifies: a denied note used its number.
 */
export function findReusableRejected(orderSessionId: string, documentType: FiscalDocumentType = 'NFCe') {
  return prisma.nFeDocument.findFirst({
    where: { orderSessionId, documentType, status: 'rejected' },
    orderBy: { createdAt: 'desc' },
  });
}

export interface NumberToVoid {
  documentType: FiscalDocumentType;
  series: number;
  number: number;
  reason: 'gap' | 'rejected';
  documentId?: string;
}

/**
 * Numbers of the current series that SEFAZ never received as a valid note and that must be
 * voided (inutilização): holes in the sequence below the counter, and rejected notes that were
 * not re-sent. Pending / processing notes are excluded: they may still be authorised.
 */
export async function listNumbersToVoid(configId: string): Promise<NumberToVoid[]> {
  const config = await prisma.nFeConfig.findUniqueOrThrow({ where: { id: configId } });
  const result: NumberToVoid[] = [];

  for (const documentType of ['NFCe', 'NFe'] as const) {
    const series = config[seriesField(documentType)];
    const next = config[counterField(documentType)];
    const docs = await prisma.nFeDocument.findMany({
      where: { configId, documentType, documentSeries: series, documentNumber: { lt: next } },
      select: { id: true, documentNumber: true, status: true },
      orderBy: { documentNumber: 'asc' },
    });
    if (docs.length === 0) continue;

    const used = new Set(docs.map((d) => d.documentNumber));
    for (let n = docs[0].documentNumber; n < next; n++) {
      if (!used.has(n)) result.push({ documentType, series, number: n, reason: 'gap' });
    }
    for (const d of docs) {
      if (d.status === 'rejected') {
        result.push({ documentType, series, number: d.documentNumber, reason: 'rejected', documentId: d.id });
      }
    }
  }
  return result.sort((a, b) => a.documentType.localeCompare(b.documentType) || a.number - b.number);
}
