import type { EntryType } from './rules';

/** Names of the ledger line types, shared by the screens and the receipts. */
export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  RECEIPT: 'Recebimento', CHANGE: 'Troco', WITHDRAWAL: 'Sangria', SUPPLY: 'Suprimento', EXPENSE: 'Despesa', REFUND: 'Estorno', ADJUSTMENT: 'Ajuste',
};
