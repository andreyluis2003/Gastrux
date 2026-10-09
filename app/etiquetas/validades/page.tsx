'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SettleButtons } from '@/components/labels/settle-buttons';
import { STORAGE_LABEL, type Storage } from '@/lib/labels/rules';

interface LabelRow {
  id: string;
  itemName: string;
  storage: Storage;
  expiresAt: string;
  quantity: number | null;
  unit: string | null;
  status: 'ACTIVE' | 'USED' | 'DISCARDED';
  settledAt: string | null;
  printedBy: { name: string | null } | null;
}
interface Board { expired: LabelRow[]; today: LabelRow[]; tomorrow: LabelRow[]; history: LabelRow[] }

const fmt = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Expired, expiring today and tomorrow, with Used / Discarded (spec 2026-10-09 etiquetas, 5.3; Pro and up) */
export default function ExpiryPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    const res = await fetch('/api/labels/expiry');
    const body = await res.json().catch(() => ({}));
    // The plan answer carries the upgrade link (lib/api/tier-middleware.ts); a role refusal does not
    if (res.status === 403 && body.upgradeUrl) {
      setLocked(true);
      return;
    }
    if (!res.ok) {
      setError(body.error || 'Não foi possível carregar as validades');
      return;
    }
    setBoard(body);
  };
  useEffect(() => {
    load();
  }, []);

  if (locked) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card className="p-6 space-y-2">
          <h1 className="text-xl font-bold">Validades</h1>
          <p>Controle de validades no plano Pro: lista do que venceu e do que vence hoje, aviso de manhã e descarte lançado no desperdício.</p>
          <Link href="/pricing" className="font-medium text-blue-600 hover:underline">Ver planos</Link>
        </Card>
      </div>
    );
  }
  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!board) return <p className="p-4">Carregando...</p>;

  const row = (l: LabelRow) => (
    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <Link href={`/etiquetas/${l.id}`} className="font-medium hover:underline">{l.itemName}</Link>
        <p className="text-xs text-gray-600">
          {STORAGE_LABEL[l.storage]} · validade {fmt(l.expiresAt)}
          {l.quantity ? ` · ${l.quantity.toLocaleString('pt-BR')} ${l.unit}` : ''} · {l.printedBy?.name?.split(' ')[0] ?? ''}
        </p>
      </div>
      <SettleButtons labelId={l.id} onDone={load} />
    </li>
  );
  const section = (title: string, list: LabelRow[], tone: string) => (
    <Card className={`p-4 ${tone}`}>
      <h2 className="font-semibold">{title} ({list.length})</h2>
      <ul className="divide-y">{list.map(row)}</ul>
    </Card>
  );
  const nothing = !board.expired.length && !board.today.length && !board.tomorrow.length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Validades</h1>
        <Link href="/etiquetas" className="text-sm font-medium text-blue-600 hover:underline">Imprimir etiqueta</Link>
      </div>
      {nothing && <Card className="p-4">Nada vencendo hoje ou amanhã.</Card>}
      {board.expired.length > 0 && section('Vencidas', board.expired, 'border-red-300 bg-red-50')}
      {board.today.length > 0 && section('Vencem hoje', board.today, 'border-amber-300 bg-amber-50')}
      {board.tomorrow.length > 0 && section('Vencem amanhã', board.tomorrow, '')}
      <button type="button" className="text-sm font-medium text-blue-600 hover:underline" onClick={() => setShowHistory(!showHistory)}>
        {showHistory ? 'Esconder histórico' : 'Histórico (30 dias)'}
      </button>
      {showHistory && (
        <Card className="p-4">
          {board.history.length ? (
            <ul className="divide-y">
              {board.history.map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <span className="font-medium">{l.itemName}</span> · {l.status === 'USED' ? 'Usada' : 'Descartada'}
                  {l.settledAt ? ` em ${fmt(l.settledAt)}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma baixa nos últimos 30 dias.</p>
          )}
        </Card>
      )}
    </div>
  );
}
