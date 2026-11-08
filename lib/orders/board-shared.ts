/** Types and labels of Todos os pedidos, safe for the browser (spec 2026-11-07 quadro-de-pedidos) */
export type Channel = 'salao' | 'balcao' | 'site' | 'whatsapp' | 'ifood' | 'api' | 'outros';
export type Stage = 'novo' | 'preparo' | 'pronto' | 'entrega';
export interface BoardCard {
  id: string;
  channel: Channel;
  stage: Stage;
  label: string;
  number: string;
  items: number;
  totalCents: number | null;
  createdAt: string;
  href: string;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  salao: 'Salão', balcao: 'Balcão', site: 'Site', whatsapp: 'WhatsApp', ifood: 'iFood', api: 'API', outros: 'Outros',
};
export const STAGES: { id: Stage; title: string }[] = [
  { id: 'novo', title: 'Novos' },
  { id: 'preparo', title: 'Em preparo' },
  { id: 'pronto', title: 'Prontos' },
  { id: 'entrega', title: 'Em entrega' },
];

export function platformChannel(platform: string | null | undefined): Channel {
  if (platform === 'delivery_site') return 'site';
  if (platform === 'ifood') return 'ifood';
  if (platform === 'gastrux_api') return 'api';
  return 'outros';
}

/** The channel of a comanda: a table, the WhatsApp robot (it writes "Pedido via WhatsApp" in the notes) or the counter */
export function sessionChannel(s: { tableNumber?: number | null; table?: { number: number } | null; notes?: string | null } | null): Channel {
  if (s?.notes?.startsWith('Pedido via WhatsApp')) return 'whatsapp';
  if (s?.table?.number ?? s?.tableNumber) return 'salao';
  return 'balcao';
}

