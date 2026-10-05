/**
 * The number SEFAZ knows a note by is the one in its access key, not Gastrux's internal sequence:
 * Focus numbers NFC-e on its own, so the first authorised note in homologation (2026-10-05) was
 * internal #3 but SEFAZ nº 1. Screens show the key's number so the restaurant finds the note when it
 * checks at SEFAZ or with its accountant.
 *
 * Access key layout (44 digits): cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 */
export function sefazNumber(accessKey?: string | null): { series: number; number: number } | null {
  const digits = (accessKey || '').replace(/\D/g, '');
  if (digits.length !== 44) return null;
  return { series: Number(digits.slice(22, 25)), number: Number(digits.slice(25, 34)) };
}

const TYPE_LABEL: Record<string, string> = { NFCe: 'NFC-e', NFe: 'NF-e' };

/** "NFC-e nº 3 (Série 1)" for a note SEFAZ numbered; a note that never got a key has no SEFAZ number */
export function noteLabel(doc: { documentType: string; documentNumber: number; accessKey?: string | null }): string {
  const type = TYPE_LABEL[doc.documentType] || doc.documentType;
  const n = sefazNumber(doc.accessKey);
  return n ? `${type} nº ${n.number} (Série ${n.series})` : `${type} sem número na SEFAZ (ref. interna ${doc.documentNumber})`;
}

const STATUS_LABEL: Record<string, string> = {
  authorized: 'Autorizada',
  pending: 'Pendente',
  processing: 'Em processamento',
  submitted: 'Enviada',
  rejected: 'Rejeitada',
  denied: 'Denegada',
  cancelled: 'Cancelada',
};

export function noteStatusLabel(status: string): string {
  return STATUS_LABEL[status] || status;
}
