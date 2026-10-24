'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Status = 'TRIAL' | 'CONFIRMING' | 'EARNED' | 'APPLIED' | 'CANCELLED';
interface Mine {
  code: string;
  link: string;
  rule: string;
  counts: { trial: number; confirming: number; earned: number; applied: number; cancelled: number };
  monthsThisYear: number;
  items: Array<{ restaurantName: string; status: Status; createdAt: string }>;
}

const LABEL: Record<Status, { text: string; className: string }> = {
  TRIAL: { text: 'Em teste', className: 'bg-slate-100 text-slate-700' },
  CONFIRMING: { text: 'Pagou: confirmando', className: 'bg-blue-100 text-blue-800' },
  EARNED: { text: 'Mês ganho (guardado)', className: 'bg-green-100 text-green-800' },
  APPLIED: { text: 'Mês usado', className: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { text: 'Cancelada', className: 'bg-red-50 text-red-700' },
};

/** Minha assinatura > Indique e ganhe (plan 2026-10-24 indicacao, Task 7); only the owner sees it */
export function ReferralCard() {
  const [mine, setMine] = useState<Mine | null>(null);

  useEffect(() => {
    fetch('/api/referrals/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMine)
      .catch(() => setMine(null));
  }, []);

  if (!mine) return null;
  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.success('Copiado'); };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Uso o Gastrux no meu restaurante (estoque, cozinha, caixa e fiscal). Teste 45 dias grátis pelo meu link: ${mine.link}`)}`;

  return (
    <Card id="indique" className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Indique e ganhe</h3>
        <p className="text-sm text-muted-foreground">
          {mine.rule}. Quem se cadastra pelo link ganha 45 dias de teste. O mês é liberado 7 dias depois da primeira
          mensalidade do indicado (até 12 por ano). <a href="/ajuda/indique-e-ganhe" className="underline">Como funciona</a>
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 break-all rounded border bg-slate-50 px-3 py-2 text-sm">{mine.link}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(mine.link)}>Copiar link</Button>
            <Button size="sm" asChild><a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Código: <strong>{mine.code}</strong>{' '}
          <button className="underline" onClick={() => copy(mine.code)}>copiar</button>
          {' '}· Meses ganhos este ano: {mine.monthsThisYear} de 12
        </p>
      </div>

      {mine.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém se cadastrou pelo seu link ainda.</p>
      ) : (
        <ul className="divide-y rounded border">
          {mine.items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{it.restaurantName}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${LABEL[it.status].className}`}>{LABEL[it.status].text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
