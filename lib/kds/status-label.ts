/** The kitchen order status in Portuguese, the words of the counters on top of the kitchen screen */
const LABEL: Record<string, string> = {
  PENDING: 'A fazer',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export function kdsStatusLabel(status: string): string {
  return LABEL[status] ?? status;
}

const PRIORITY: Record<string, string> = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Prioridade alta', URGENT: 'Urgente' };

export function kdsPriorityLabel(priority: string): string {
  return PRIORITY[priority] ?? priority;
}
