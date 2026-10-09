'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { SettleButtons } from '@/components/labels/settle-buttons';
import { STORAGE_LABEL, type Storage } from '@/lib/labels/rules';

interface FoodLabelView {
  id: string;
  itemType: 'RECIPE' | 'INGREDIENT';
  itemName: string;
  storage: Storage;
  preparedAt: string;
  expiresAt: string;
  quantity: number | null;
  unit: string | null;
  status: 'ACTIVE' | 'USED' | 'DISCARDED';
  printedBy: { name: string | null } | null;
  settledBy: { name: string | null } | null;
  settledAt: string | null;
  batch: { batchNumber: string } | null;
  canSettle: boolean;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = { ACTIVE: 'Ativa', USED: 'Usada', DISCARDED: 'Descartada' } as const;

/** A label opened by its QR code on a phone (spec 2026-10-09 etiquetas, 5.4): same restaurant only */
export default function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const [label, setLabel] = useState<FoodLabelView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/labels/${id}`);
    if (!res.ok) {
      setError('Etiqueta não encontrada neste restaurante.');
      return;
    }
    setLabel(await res.json());
  };
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!label) return <p className="p-4">Carregando...</p>;
  const expired = label.status === 'ACTIVE' && new Date(label.expiresAt).getTime() <= Date.now();

  return (
    <div className="max-w-md mx-auto p-4">
      <Card className="p-5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold">{label.itemName}</h1>
          {expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Vencida</span>}
        </div>
        <p>{label.itemType === 'RECIPE' ? 'Preparado' : 'Aberto'} em {fmt(label.preparedAt)}</p>
        <p className="text-lg font-bold">Validade: {fmt(label.expiresAt)}</p>
        <p>
          {STORAGE_LABEL[label.storage]}
          {label.quantity ? ` · ${label.quantity.toLocaleString('pt-BR')} ${label.unit}` : ''}
        </p>
        <p>
          Responsável: {label.printedBy?.name ?? '-'}
          {label.batch ? ` · Lote ${label.batch.batchNumber}` : ''}
        </p>
        <p>
          Situação: <strong>{STATUS[label.status]}</strong>
          {label.settledAt ? ` em ${fmt(label.settledAt)}${label.settledBy?.name ? ` por ${label.settledBy.name}` : ''}` : ''}
        </p>
        {label.status === 'ACTIVE' &&
          (label.canSettle ? (
            <div className="pt-2">
              <SettleButtons labelId={label.id} onDone={load} />
            </div>
          ) : (
            <p className="pt-2 text-sm">
              Controle de validades no plano Pro.{' '}
              <Link href="/pricing" className="font-medium text-blue-600 hover:underline">Ver planos</Link>
            </p>
          ))}
      </Card>
    </div>
  );
}
