'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface Question { createdAt: string; userName: string | null; role: string; question: string; answer: string | null; model: string | null; counted: boolean; free?: boolean }
interface Usage { plan: string; used: number; limit: number | null; free: { used: number; limit: number } | null; questions: Question[] }

const ROLE_LABEL: Record<string, string> = { OWNER: 'Dono', MANAGER: 'Gerente', CASHIER: 'Caixa', COOK: 'Cozinha', ADMIN: 'Admin' };
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const short = (raw: string | null) => {
  const s = (raw ?? '').replace(/\*\*/g, '');
  return !s ? '-' : s.length > 120 ? `${s.slice(0, 120)}…` : s;
};

/** Uso da IA (spec 2026-10-16 ia-assistente §4.6): questions of the month, owner and managers */
export default function AiUsagePage() {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/ai/usage', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setError(body.error || 'Não foi possível carregar o uso da IA');
        setData(body);
      } catch {
        setError('Sem conexão. Tente de novo.');
      }
    })();
  }, []);

  if (!data) return <div className="max-w-4xl mx-auto p-4 text-muted-foreground">{error ?? 'Carregando…'}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Uso da IA</h1>
        <p className="text-sm text-muted-foreground">Perguntas feitas ao "Pergunte ao Gastrux" neste mês.</p>
      </div>

      <Card className="p-4">
        <p className="text-sm">
          Plano <span className="font-semibold capitalize">{data.plan}</span>:{' '}
          <span className="font-semibold">{data.used}</span> de {data.limit ?? 'ilimitadas'} perguntas este mês
        </p>
        {data.free && (
          <p className="mt-1 text-sm text-muted-foreground">
            Implantação: {data.free.used} de {data.free.limit} perguntas grátis (primeiros 30 dias)
          </p>
        )}
      </Card>

      <Card className="p-0 overflow-x-auto">
        {data.questions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma pergunta este mês.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data/hora</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Perfil</th>
                <th className="px-3 py-2">Pergunta</th>
                <th className="px-3 py-2">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {data.questions.map((q, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{when(q.createdAt)}</td>
                  <td className="px-3 py-2">{q.userName ?? '-'}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[q.role] ?? q.role}</td>
                  <td className="px-3 py-2 min-w-[180px]">{q.question}</td>
                  <td className="px-3 py-2 min-w-[220px] text-muted-foreground">
                    {short(q.answer)}
                    {q.free ? <span className="ml-1 text-xs text-emerald-700">(grátis, implantação)</span> : !q.counted && <span className="ml-1 text-xs text-amber-600">(não contou)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
