'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Row {
  restaurantId: string; name: string; tier: string; questions: number; limit: number | null; costUsd: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  errors: number; detailed: number; withFiles: number; lastAt: string | null;
}
interface Data { month: string; totals: { questions: number; costUsd: number; errors: number }; restaurants: Row[] }

const TIER: Record<string, string> = { starter: 'Sem plano', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
const usd = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = (v: number) => v.toLocaleString('pt-BR');
const shift = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
// Brasília month: three hours behind UTC
const thisMonth = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);

/** Plataforma > Custo da IA (pendências M7, owner 2026-10-23): what each restaurant spent on the AI in the month */
export default function AiCostsPage() {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/admin/platform/ai-costs?month=${month}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(body.error || 'Não foi possível carregar');
        else setData(body);
      })
      .catch(() => { if (!cancelled) setError('Sem conexão. Tente de novo.'); });
    return () => { cancelled = true; };
  }, [month]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Custo da IA</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte ao Gastrux por restaurante, no mês de Brasília. O custo soma todas as chamadas, também as que deram erro
          (foram pagas); as perguntas são as que contam no limite do plano.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonth((m) => shift(m, -1))}>←</Button>
        <span className="min-w-40 text-center font-medium capitalize">{monthLabel(month)}</span>
        <Button variant="outline" size="sm" disabled={month >= thisMonth()} onClick={() => setMonth((m) => shift(m, 1))}>→</Button>
      </div>

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}
      {!data && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Custo no mês</p><p className="text-2xl font-bold">{usd(data.totals.costUsd)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Perguntas contadas</p><p className="text-2xl font-bold">{num(data.totals.questions)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Com erro</p><p className="text-2xl font-bold">{num(data.totals.errors)}</p></Card>
          </div>

          {data.restaurants.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">Nenhuma pergunta à IA neste mês.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2">Restaurante</th>
                    <th className="p-2">Plano</th>
                    <th className="p-2 text-right">Perguntas</th>
                    <th className="p-2 text-right">Custo</th>
                    <th className="p-2 text-right">Custo por pergunta</th>
                    <th className="p-2 text-right">Tokens (entrada / saída / cache)</th>
                    <th className="p-2 text-right">Detalhadas</th>
                    <th className="p-2 text-right">Com arquivo</th>
                    <th className="p-2 text-right">Erros</th>
                    <th className="p-2">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {data.restaurants.map((r) => (
                    <tr key={r.restaurantId} className="border-t">
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2">{TIER[r.tier] ?? r.tier}</td>
                      <td className={`p-2 text-right ${r.limit !== null && r.questions >= r.limit ? 'text-red-600 font-medium' : ''}`}>
                        {num(r.questions)}{r.limit === null ? '' : ` de ${num(r.limit)}`}
                      </td>
                      <td className="p-2 text-right">{usd(r.costUsd)}</td>
                      <td className="p-2 text-right">{r.questions > 0 ? usd(r.costUsd / r.questions) : '—'}</td>
                      <td className="p-2 text-right whitespace-nowrap">{num(r.inputTokens)} / {num(r.outputTokens)} / {num(r.cacheReadTokens + r.cacheWriteTokens)}</td>
                      <td className="p-2 text-right">{num(r.detailed)}</td>
                      <td className="p-2 text-right">{num(r.withFiles)}</td>
                      <td className="p-2 text-right">{num(r.errors)}</td>
                      <td className="p-2 whitespace-nowrap">{r.lastAt ? new Date(r.lastAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
