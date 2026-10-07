'use client';

import { brl } from '@/components/caixa/money';
import { openFor } from '@/lib/vender/rules';
import type { Salao, SalaoSession, SalaoTable } from '@/lib/vender/salao';

function Tile({ title, session, onClick }: { title: string; session: SalaoSession | null; onClick: () => void }) {
  const busy = !!session;
  const asked = !!session?.billRequested;
  return (
    <button
      onClick={onClick}
      className={`min-h-[88px] rounded-xl border-2 p-3 text-left transition active:scale-[0.98] ${
        asked ? 'bg-amber-50 border-amber-400 text-amber-900' : busy ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
      }`}
    >
      <div className="text-lg font-bold">{title}</div>
      {asked && <div className="text-xs font-semibold">Pediu a conta</div>}
      {busy ? (
        <div className="text-sm">
          {brl(session!.totalCents)} · {openFor(session!.openedAt, new Date())}
          {session!.newCount > 0 && <span className="ml-1 text-amber-700">· {session!.newCount} a enviar</span>}
        </div>
      ) : (
        <div className="text-sm">Livre</div>
      )}
    </button>
  );
}

/** The tables of the chosen section, then the comandas without a table (spec 2026-10-07, 4.1 items 5 and 6) */
export function SalaoGrid({ salao, section, onOpenTable, onOpenSession }: {
  salao: Salao;
  section: string | null;
  onOpenTable: (table: SalaoTable) => void;
  onOpenSession: (session: SalaoSession) => void;
}) {
  const tables = section ? salao.tables.filter((t) => t.sectionId === section) : salao.tables;
  return (
    <div className="space-y-6">
      {tables.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map((t) => (
            <Tile key={t.id} title={`Mesa ${t.number}`} session={t.session} onClick={() => onOpenTable(t)} />
          ))}
        </div>
      )}
      {salao.others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">Comandas e balcão</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {salao.others.map((s) => (
              <Tile key={s.id} title={s.label} session={s} onClick={() => onOpenSession(s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
