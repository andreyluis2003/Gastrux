/**
 * The reasons 99Food accepts to refuse or cancel an order (plan 2026-11-09 99food, Task 5): a fixed list, the ids are
 * 99Food's. Some only make sense when the store delivers itself (delivery_type 2); "Outro motivo" needs a typed reason.
 */
export interface NinetynineCancelReason {
  id: number;
  label: string;
  selfDeliveryOnly?: boolean;
  needsText?: boolean;
}

export const NINETYNINE_CANCEL_REASONS: NinetynineCancelReason[] = [
  { id: 1010, label: 'Item esgotado' },
  { id: 1020, label: 'Loja fechada por hoje' },
  { id: 1030, label: 'Loja sem condições de preparar agora (muito movimento)' },
  { id: 1040, label: 'Acidente ou falta de energia/água' },
  { id: 1050, label: 'Problema com o cliente' },
  { id: 1060, label: 'Sem entregador', selfDeliveryOnly: true },
  { id: 1070, label: 'Cardápio precisa ser atualizado' },
  { id: 1071, label: 'Fora da área de entrega', selfDeliveryOnly: true },
  { id: 1072, label: 'Endereço em área insegura', selfDeliveryOnly: true },
  { id: 1073, label: 'Suspeita de fraude ou trote' },
  { id: 1074, label: 'Dúvida sobre taxas ou promoções' },
  { id: 1080, label: 'Outro motivo', needsText: true },
];

/** The reasons this order can use, in the shape of the iFood list (Pedidos de delivery shows either) */
export function ninetynineCancelReasons(deliveryType: unknown): Array<{ cancelCodeId: string; description: string }> {
  return NINETYNINE_CANCEL_REASONS
    .filter((r) => !r.selfDeliveryOnly || Number(deliveryType) === 2)
    .map((r) => ({ cancelCodeId: String(r.id), description: r.label }));
}

/** What is wrong with this reason for this order; null when 99Food takes it */
export function ninetynineReasonProblem(code: string, reason: string, deliveryType: unknown): 'reason' | 'text' | null {
  const r = NINETYNINE_CANCEL_REASONS.find((x) => String(x.id) === code.trim());
  if (!r || (r.selfDeliveryOnly && Number(deliveryType) !== 2)) return 'reason';
  if (r.needsText && (!reason.trim() || reason.trim() === r.label)) return 'text';
  return null;
}
