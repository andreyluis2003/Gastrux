'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LOSS_REASONS } from '@/lib/daily-count/compute';

interface Row { recipeId: string; name: string; opening: number; mounted: number; sold: number; loss: number; expected: number }
interface Entry { id: string; recipeId: string; kind: 'OPENING' | 'MOUNTED' | 'LOSS'; quantity: number; reason: string | null; userName: string | null; createdAt: string; canDelete: boolean }
interface Board { countId: string; openedAt: string; title: string; firstUse: boolean; hasOpening: boolean; openTooLong: boolean; canClose: boolean; rows: Row[]; entries: Entry[] }
interface HistoryNight { id: string; openedAt: string; closedAt: string; closedBy: string | null; sold: number; loss: number; difference: number; differenceValue: number; missing: number; missingValue: number; extra: number;
  lines: { recipeName: string; opening: number; mounted: number; sold: number; loss: number; expected: number; counted: number; difference: number }[] }
interface History { nights: HistoryNight[]; byItem: { recipeName: string; sold: number; loss: number; difference: number; missing: number; extra: number }[] }

const TZ = 'America/Sao_Paulo';
const when = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hour = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const KIND_LABEL = { OPENING: 'Início', MOUNTED: 'Montados', LOSS: 'Perda' };
const diffClass = (d: number) => (d < 0 ? 'text-red-600 font-semibold' : d > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground');

// Same fallback as the offline outbox (lib/offline/outbox.ts): randomUUID needs a secure context
const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

// useSearchParams needs a Suspense boundary in the Next 14 build
export default function DailyCountPage() {
  return <Suspense fallback={null}><DailyCountScreen /></Suspense>;
}

/** Contagem do dia / de espetos (spec 2026-10-16): taps during the night, close with the real count, history */
function DailyCountScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'noite' | 'historico'>(params.get('tab') === 'historico' ? 'historico' : 'noite');
  const [board, setBoard] = useState<Board | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lossFor, setLossFor] = useState<Row | null>(null);
  const [closing, setClosing] = useState<Record<string, string> | null>(null);
  const [openingFor, setOpeningFor] = useState<Record<string, string> | null>(null);
  const [closeKey, setCloseKey] = useState(newKey);

  const load = useCallback(async () => {
    const res = await fetch('/api/daily-count', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || 'Não foi possível carregar a contagem');
    setError(null);
    setBoard(body);
  }, []);
  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/daily-count/history?weeks=4', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || 'Não foi possível carregar o histórico');
    setHistory(body);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // sold updates during the night
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (tab === 'historico') loadHistory();
  }, [tab, loadHistory]);

  const post = async (url: string, body: unknown, key = newKey()) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || 'Não foi possível salvar'); return false; }
      setError(null);
      await load();
      return true;
    } catch {
      setError('Sem conexão: o lançamento não foi salvo. Tente de novo.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const tap = (row: Row, quantity: number) => post('/api/daily-count/entries', { recipeId: row.recipeId, kind: 'MOUNTED', quantity });
  const typed = (row: Row) => {
    const v = window.prompt(`Quantos ${row.name} foram montados?`);
    if (v && Number(v) > 0) tap(row, Number(v));
  };
  const undo = async (e: Entry) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/daily-count/entries/${e.id}`, { method: 'DELETE' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return setError(out.error || 'Não foi possível apagar');
      setError(null);
      await load();
    } catch {
      setError('Sem conexão: não foi possível desfazer. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !board) return <div className="max-w-3xl mx-auto p-4"><Card className="p-6 text-red-600">{error}</Card></div>;
  if (!board) return <div className="max-w-3xl mx-auto p-4 text-muted-foreground">Carregando…</div>;

  const totals = board.rows.reduce((t, r) => ({ sold: t.sold + r.sold, loss: t.loss + r.loss }), { sold: 0, loss: 0 });

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{board.title}</h1>
          <p className="text-sm text-muted-foreground">Noite aberta em {when(board.openedAt)} · {totals.sold} vendidos · {totals.loss} perdas</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'noite' ? 'default' : 'outline'} onClick={() => setTab('noite')}>Esta noite</Button>
          <Button variant={tab === 'historico' ? 'default' : 'outline'} onClick={() => setTab('historico')}>Histórico</Button>
        </div>
      </div>

      {error && <Card className="p-3 text-red-600 text-sm">{error}</Card>}

      {tab === 'noite' && (
        <>
          {board.openTooLong && (
            <Card className="p-3 border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-sm">
              Contagem aberta desde {when(board.openedAt)}. Feche para conferir.
            </Card>
          )}
          {board.firstUse && !board.hasOpening && board.rows.length > 0 && (
            <Card className="p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
              <span>Primeira contagem: quantos você já tem de cada na geladeira?</span>
              <Button size="sm" variant="outline" onClick={() => { setError(null); setOpeningFor(Object.fromEntries(board.rows.filter((r) => r.opening === 0).map((r) => [r.recipeId, '']))); }}>Lançar o início</Button>
            </Card>
          )}
          {board.rows.length === 0 ? (
            <Card className="p-6 text-sm">
              Nenhum item na contagem. Marque "Contar na contagem do dia" na ficha técnica dos itens (espetos, salgados) em Fichas técnicas.
            </Card>
          ) : (
            <div className="space-y-2">
              {board.rows.map((r) => (
                <Card key={r.recipeId} className="p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm">Deveria ter <span className={`text-lg font-bold ${r.expected < 0 ? 'text-red-600' : ''}`}>{r.expected}</span></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center text-xs text-muted-foreground mt-1">
                    <div>Início<div className="text-base text-foreground">{r.opening}</div></div>
                    <div>Montados<div className="text-base text-foreground">{r.mounted}</div></div>
                    <div>Vendidos<div className="text-base text-foreground">{r.sold}</div></div>
                    <div>Perda<div className="text-base text-foreground">{r.loss}</div></div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Button size="sm" disabled={busy} onClick={() => tap(r, 1)}>+1</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => tap(r, 10)}>+10</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => tap(r, 20)}>+20</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => typed(r)}>Outro valor</Button>
                    <Button size="sm" disabled={busy} variant="outline" className="text-red-600" onClick={() => setLossFor(r)}>Perda</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">Entram nos vendidos as comandas, a venda de balcão e o delivery do site. Pedidos do iFood e do Keeta só entram se chegarem pela integração ou forem lançados no Gastrux.</p>

          {board.canClose && board.rows.length > 0 && (
            <Button className="w-full" disabled={busy} onClick={() => { setCloseKey(newKey()); setError(null); setClosing(Object.fromEntries(board.rows.map((r) => [r.recipeId, '']))); }}>Fechar contagem</Button>
          )}

          {board.entries.length > 0 && (
            <Card className="p-3">
              <div className="font-semibold mb-2 text-sm">Lançamentos desta noite</div>
              <ul className="space-y-1 text-sm">
                {board.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span>
                      {hour(e.createdAt)} · {KIND_LABEL[e.kind]} {e.quantity} · {board.rows.find((r) => r.recipeId === e.recipeId)?.name ?? ''}
                      {e.reason ? ` (${e.reason})` : ''} · {e.userName ?? ''}
                    </span>
                    {e.canDelete && <button className="text-xs text-red-600 hover:underline" disabled={busy} onClick={() => undo(e)}>Desfazer</button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tab === 'historico' && (
        <div className="space-y-3">
          {!history ? <p className="text-muted-foreground">Carregando…</p> : history.nights.length === 0 ? (
            <Card className="p-6 text-sm">Nenhuma contagem fechada nas últimas 4 semanas.</Card>
          ) : (
            <>
              <Card className="p-3">
                <div className="font-semibold mb-2">Últimas 4 semanas, por item</div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th>Item</th><th className="text-right">Vendidos</th><th className="text-right">Perdas</th><th className="text-right">Faltaram</th><th className="text-right">A mais</th></tr></thead>
                  <tbody>{history.byItem.map((i) => (
                    <tr key={i.recipeName}><td>{i.recipeName}</td><td className="text-right">{i.sold}</td><td className="text-right">{i.loss}</td><td className={`text-right ${diffClass(-i.missing)}`}>{i.missing}</td><td className={`text-right ${diffClass(i.extra)}`}>{i.extra}</td></tr>
                  ))}</tbody>
                </table>
              </Card>
              {history.nights.map((n) => (
                <Card key={n.id} className="p-3">
                  <div className="flex justify-between gap-2 flex-wrap text-sm">
                    <span className="font-semibold">{when(n.openedAt)} até {when(n.closedAt)}</span>
                    <span className="flex gap-3">
                      <span className={diffClass(-n.missing)}>{n.missing ? `Faltaram ${n.missing} (${brl(n.missingValue)})` : 'Nada faltou'}</span>
                      {n.extra > 0 && <span className={diffClass(n.extra)}>{n.extra} a mais</span>}
                    </span>
                  </div>
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-left text-muted-foreground"><th>Item</th><th className="text-right">Início</th><th className="text-right">Mont.</th><th className="text-right">Vend.</th><th className="text-right">Perda</th><th className="text-right">Devia</th><th className="text-right">Contou</th><th className="text-right">Dif.</th></tr></thead>
                    <tbody>{n.lines.map((l) => (
                      <tr key={l.recipeName}><td>{l.recipeName}</td><td className="text-right">{l.opening}</td><td className="text-right">{l.mounted}</td><td className="text-right">{l.sold}</td><td className="text-right">{l.loss}</td><td className="text-right">{l.expected}</td><td className="text-right">{l.counted}</td><td className={`text-right ${diffClass(l.difference)}`}>{l.difference}</td></tr>
                    ))}</tbody>
                  </table>
                  {n.closedBy && <p className="text-xs text-muted-foreground mt-1">Fechada por {n.closedBy}</p>}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {lossFor && <LossDialog row={lossFor} busy={busy} error={error} onCancel={() => { setLossFor(null); setError(null); }}
        onSave={async (quantity, reason, note) => { if (await post('/api/daily-count/entries', { recipeId: lossFor.recipeId, kind: 'LOSS', quantity, reason, note })) setLossFor(null); }} />}

      {openingFor && (
        <CountDialog title="Início: quantos você já tem de cada?" rows={board.rows.filter((r) => r.recipeId in openingFor)} values={openingFor} onChange={setOpeningFor} busy={busy}
          error={error} allowEmpty confirm="Salvar início" onCancel={() => { setOpeningFor(null); setError(null); }}
          onConfirm={async () => {
            // Item by item; a saved item leaves the dialog, so a retry after a failure never doubles it (review I2)
            for (const r of board.rows.filter((x) => x.recipeId in openingFor)) {
              const q = Number(openingFor[r.recipeId]);
              if (q > 0) {
                if (!(await post('/api/daily-count/entries', { recipeId: r.recipeId, kind: 'OPENING', quantity: q }))) return;
                setOpeningFor((prev) => { if (!prev) return prev; const next = { ...prev }; delete next[r.recipeId]; return next; });
              }
            }
            setOpeningFor(null);
          }} />
      )}

      {closing && (
        <CountDialog title="Fechar contagem: quantos sobraram de cada?" rows={board.rows} values={closing} onChange={setClosing} busy={busy}
          error={error} confirm="Fechar contagem" showExpected onCancel={() => { setClosing(null); setError(null); }}
          onConfirm={async () => {
            if (await post('/api/daily-count/close', { countId: board.countId, counts: board.rows.map((r) => ({ recipeId: r.recipeId, counted: closing[r.recipeId] })) }, closeKey)) {
              setClosing(null);
              setTab('historico');
            }
          }} />
      )}
    </div>
  );
}

function LossDialog({ row, busy, error, onCancel, onSave }: { row: Row; busy: boolean; error: string | null; onCancel: () => void; onSave: (q: number, reason: string, note: string) => void }) {
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<string>('Queimou');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Perda: {row.name}</h2>
        <input className="w-full border rounded p-2 bg-background" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Quantidade" />
        <div className="flex gap-2 flex-wrap">
          {LOSS_REASONS.map((r) => <Button key={r} size="sm" variant={reason === r ? 'default' : 'outline'} onClick={() => setReason(r)}>{r}</Button>)}
        </div>
        {reason === 'Outro' && <input className="w-full border rounded p-2 bg-background" placeholder="Qual o motivo?" value={note} onChange={(e) => setNote(e.target.value)} />}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy} onClick={() => onSave(Number(quantity), reason, note)}>Lançar perda</Button>
        </div>
      </Card>
    </div>
  );
}

const isCount = (v: string | undefined) => v !== undefined && /^\d+$/.test(v.trim());

function CountDialog({ title, rows, values, onChange, busy, error, allowEmpty, confirm, showExpected, onCancel, onConfirm }: {
  title: string; rows: Row[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; busy: boolean;
  error: string | null; allowEmpty?: boolean; confirm: string; showExpected?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  // Checked here first (review I5): an empty or broken field is marked on its own line
  const bad = rows.filter((r) => { const v = values[r.recipeId] ?? ''; return allowEmpty ? v.trim() !== '' && !isCount(v) : !isCount(v); });
  const [tried, setTried] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{title}</h2>
        {rows.map((r) => {
          const v = values[r.recipeId];
          const diff = v !== '' && v !== undefined ? Number(v) - r.expected : null;
          return (
            <div key={r.recipeId} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{r.name}{showExpected && <span className="text-muted-foreground"> · deveria ter {r.expected}</span>}</span>
              <input className={`w-20 border rounded p-2 bg-background text-right ${tried && bad.includes(r) ? 'border-red-600' : ''}`} inputMode="numeric" value={v ?? ''} onChange={(e) => onChange({ ...values, [r.recipeId]: e.target.value })} aria-label={r.name} />
              {showExpected && diff !== null && !Number.isNaN(diff) && (
                <span className={`w-24 text-xs ${diffClass(diff)}`}>{diff < 0 ? `faltam ${-diff}` : diff > 0 ? `${diff} a mais` : 'certo'}</span>
              )}
            </div>
          );
        })}
        {tried && bad.length > 0 && <p className="text-sm text-red-600">Preencha com números inteiros: {bad.map((r) => r.name).join(', ')}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy} onClick={() => { setTried(true); if (bad.length === 0) onConfirm(); }}>{confirm}</Button>
        </div>
      </Card>
    </div>
  );
}
