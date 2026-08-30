// @ts-nocheck
/**
 * Mapeamento de rótulos legíveis para ações de auditoria
 */
export const ACTION_LABELS: Record<string, string> = {
  USER_CREATE: 'Usuário Criado',
  USER_UPDATE: 'Usuário Atualizado',
  USER_DELETE: 'Usuário Deletado',
  USER_ROLE_CHANGE: 'Função Alterada',
  RECIPE_CREATE: 'Receita Criada',
  RECIPE_UPDATE: 'Receita Atualizada',
  RECIPE_DELETE: 'Receita Deletada',
  ORDER_CREATE: 'Pedido Criado',
  ORDER_UPDATE: 'Pedido Atualizado',
  ORDER_CANCEL: 'Pedido Cancelado',
  PAYMENT_PROCESS: 'Pagamento Processado',
  PAYMENT_REFUND: 'Reembolso Processado',
  INGREDIENT_CREATE: 'Ingrediente Criado',
  INGREDIENT_UPDATE: 'Ingrediente Atualizado',
  INGREDIENT_DELETE: 'Ingrediente Deletado',
  STOCK_ADJUSTMENT: 'Estoque Ajustado',
  STOCK_TRANSFER: 'Estoque Transferido',
  PRICE_CHANGE: 'Preço Alterado',
  DISCOUNT_APPLIED: 'Desconto Aplicado',
  PERMISSION_CHANGE: 'Permissão Alterada',
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
