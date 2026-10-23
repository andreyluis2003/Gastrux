'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Papel = 'GERENTE' | 'CAIXA' | 'COZINHA';
interface MenuItemRow { nome: string; descricao: string; preco: string }
interface MenuCat { nome: string; itens: MenuItemRow[] }
interface TablesForm { quantidade: string; inicio: string; area: string; lugares: string }
interface Person { nome: string; email: string; papel: Papel }
interface Loaded {
  draft: { id: string; kind: 'MENU' | 'TABLES' | 'STAFF'; payload: any; result: any };
  state: 'PENDING' | 'APPLIED' | 'DISCARDED' | 'EXPIRED';
  marks: any;
}

const PAPEL_LABEL: Record<Papel, string> = { GERENTE: 'Gerente', CAIXA: 'Caixa ou garçom', COZINHA: 'Cozinha' };
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const priceText = (n: number) => n.toFixed(2).replace('.', ',');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Revisar e confirmar a draft made by the AI (spec 2026-10-17 ia-implantacao §4.4) */
export default function ReviewDraftPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [menu, setMenu] = useState<MenuCat[]>([]);
  const [removeExample, setRemoveExample] = useState(false);
  const [tables, setTables] = useState<TablesForm>({ quantidade: '', inicio: '', area: '', lugares: '' });
  const [people, setPeople] = useState<Person[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ai/drafts/${id}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setError(body.error || 'Não foi possível abrir o rascunho');
        setData(body);
        const p = body.draft.payload;
        if (body.draft.kind === 'MENU') setMenu(p.categorias.map((c: any) => ({ nome: c.nome, itens: c.itens.map((i: any) => ({ nome: i.nome, descricao: i.descricao ?? '', preco: priceText(i.preco) })) })));
        if (body.draft.kind === 'TABLES') {
          setTables({ quantidade: String(p.quantidade), inicio: String(p.inicio), area: p.area, lugares: String(p.lugares) });
          // Checked by default: kept, the example tables repeat the numbers of the new ones (homolog 2026-10-17)
          setRemoveExample(body.marks?.exampleTables > 0);
        }
        if (body.draft.kind === 'STAFF') setPeople(p.pessoas.map((x: any) => ({ ...x })));
      } catch {
        setError('Sem conexão. Tente de novo.');
      }
    })();
  }, [id]);

  if (!data) return <div className="max-w-2xl mx-auto p-4 text-muted-foreground">{error ?? 'Carregando…'}</div>;

  const back = (
    <div className="flex gap-3">
      <Link href="/dashboard" className="text-sm font-medium text-primary underline">Voltar ao início</Link>
    </div>
  );

  if (data.state !== 'PENDING' && !result) {
    const msg = data.state === 'EXPIRED' ? 'Este rascunho venceu. Peça de novo à IA.'
      : data.state === 'APPLIED' ? 'Este rascunho já foi confirmado.' : 'Este rascunho foi descartado.';
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Revisar rascunho</h1>
        <Card className="p-4 text-sm">{msg}</Card>
        {back}
      </div>
    );
  }

  const kind = data.draft.kind;
  const existing = new Set<string>((data.marks.existingNames ?? []).map(norm));
  const exampleNames = new Set<string>((data.marks.exampleNames ?? []).map(norm));
  const exampleNumbers: number[] = data.marks.exampleNumbers ?? [];
  const skippedNumbers: number[] = (data.marks.existingNumbers ?? []).filter((n: number) => !(removeExample && exampleNumbers.includes(n)));

  const payload = () => {
    if (kind === 'MENU') return { categorias: menu.map((c) => ({ nome: c.nome, itens: c.itens.map((i) => ({ nome: i.nome, descricao: i.descricao, preco: i.preco })) })), incompleto: !!data.draft.payload.incompleto };
    if (kind === 'TABLES') return { quantidade: Number(tables.quantidade), inicio: Number(tables.inicio), area: tables.area, lugares: Number(tables.lugares) };
    return { pessoas: people };
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/drafts/${id}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: payload(), removeExample }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { setError('Este rascunho já foi confirmado.'); return; }
      if (!res.ok) { setError(body.error || 'Não foi possível confirmar'); return; }
      setResult(body);
    } catch {
      setError('Sem conexão: nada foi salvo. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  // Only a 200 means discarded (pendências: a 404/409 or no network showed "descartado" anyway)
  const discard = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/drafts/${id}/discard`, { method: 'POST' });
      if (res.status === 409) {
        // Confirmed, discarded or expired meanwhile: show what it really is
        const fresh = await fetch(`/api/ai/drafts/${id}`, { cache: 'no-store' });
        if (fresh.ok) setData(await fresh.json());
        return;
      }
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body.error || 'Não foi possível descartar'); return; }
      setData({ ...data, state: 'DISCARDED' });
    } catch {
      setError('Sem conexão: o rascunho não foi descartado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-semibold">{kind === 'STAFF' && !result.people?.some((p: any) => p.ok) ? 'Ninguém foi cadastrado' : 'Pronto'}</h1>
        <Card className="p-4 space-y-2 text-sm">
          {kind === 'MENU' && (
            <>
              <p><strong>{result.created}</strong> {result.created === 1 ? 'item criado' : 'itens criados'} no cardápio.</p>
              {result.skipped?.length > 0 && <p className="text-muted-foreground">Pulados (já existiam): {result.skipped.join(', ')}</p>}
              {result.repeated?.length > 0 && <p className="text-muted-foreground">Repetidos no rascunho (entraram uma vez só): {result.repeated.join(', ')}</p>}
              {result.removedExample > 0 && <p className="text-muted-foreground">Removido o cardápio de exemplo ({result.removedExample} itens).</p>}
              <Link href="/admin/cardapio" className="font-medium text-primary underline">Ver cardápio</Link>
            </>
          )}
          {kind === 'TABLES' && (
            <>
              <p>Mesas criadas: <strong>{result.created?.join(', ') || 'nenhuma'}</strong></p>
              {result.skipped?.length > 0 && <p className="text-muted-foreground">Já existiam: {result.skipped.join(', ')}</p>}
              {result.removedExample > 0 && <p className="text-muted-foreground">Removidas as mesas de exemplo ({result.removedExample}).</p>}
              <Link href="/admin/tables" className="font-medium text-primary underline">Ver mesas</Link>
            </>
          )}
          {kind === 'STAFF' && (
            <>
              <ul className="space-y-3">
                {result.people?.map((p: any, i: number) => (
                  <li key={i} className="space-y-1">
                    <p>{p.ok ? '✓' : '✗'} <strong>{p.nome}</strong> ({p.email}){!p.ok && <span className="text-red-600">: {p.error}</span>}</p>
                    {p.ok && p.temporaryPassword && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
                        Senha temporária: <strong className="font-mono text-sm">{p.temporaryPassword}</strong>{' '}
                        <button
                          className="ml-1 underline"
                          onClick={() => { navigator.clipboard?.writeText(p.temporaryPassword); setCopied(p.email); }}
                        >
                          {copied === p.email ? 'Copiada' : 'Copiar'}
                        </button>
                        <p className="mt-1 text-amber-900">Mostrada só agora. A pessoa troca no primeiro acesso.</p>
                      </div>
                    )}
                    {p.ok && !p.temporaryPassword && <p className="text-xs text-muted-foreground">Já tinha login: entra com a senha de sempre.</p>}
                  </li>
                ))}
              </ul>
              {result.people?.some((p: any) => p.ok) ? (
                <Link href="/admin/staff" className="font-medium text-primary underline">Ver equipe</Link>
              ) : (
                // Nobody was hired: the draft is still pending, so fix the e-mails and confirm again
                <Button variant="outline" onClick={() => setResult(null)}>Corrigir e confirmar de novo</Button>
              )}
            </>
          )}
        </Card>
        {back}
      </div>
    );
  }

  const tablesEnd = Number(tables.inicio) + Number(tables.quantidade) - 1;

  return (
    <div className="max-w-2xl mx-auto p-4 pb-28 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Revisar e confirmar</h1>
        <p className="text-sm text-muted-foreground">Confira o que a IA montou. Nada entra no sistema antes de confirmar.</p>
      </div>

      {kind === 'MENU' && (
        <>
          {data.draft.payload.incompleto && (
            <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Pode estar incompleto: confira o final e mande as próximas páginas pelo chat.
            </Card>
          )}
          {data.marks.hasExample && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={removeExample} onChange={(e) => setRemoveExample(e.target.checked)} className="h-4 w-4 accent-primary" />
              Remover o cardápio de exemplo
            </label>
          )}
          {menu.map((c, ci) => (
            <Card key={ci} className="p-3 space-y-2">
              <input
                value={c.nome}
                onChange={(e) => setMenu((m) => m.map((x, j) => (j === ci ? { ...x, nome: e.target.value } : x)))}
                className="w-full rounded-md border px-2 py-1 font-semibold"
                aria-label="Nome da categoria"
              />
              {c.itens.map((it, ii) => (
                <div key={ii} className="space-y-1 border-t pt-2">
                  <div className="flex gap-2">
                    <input
                      value={it.nome}
                      onChange={(e) => setMenu((m) => m.map((x, j) => (j === ci ? { ...x, itens: x.itens.map((y, k) => (k === ii ? { ...y, nome: e.target.value } : y)) } : x)))}
                      className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                      aria-label="Nome do item"
                    />
                    <input
                      value={it.preco}
                      inputMode="decimal"
                      onChange={(e) => setMenu((m) => m.map((x, j) => (j === ci ? { ...x, itens: x.itens.map((y, k) => (k === ii ? { ...y, preco: e.target.value } : y)) } : x)))}
                      className="w-24 rounded-md border px-2 py-1 text-right text-sm"
                      aria-label="Preço"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {menu.length > 1 && (
                      <select
                        value={ci}
                        onChange={(e) => {
                          const to = Number(e.target.value);
                          setMenu((m) => m.map((x, j) => {
                            if (j === ci) return { ...x, itens: x.itens.filter((_, k) => k !== ii) };
                            if (j === to) return { ...x, itens: [...x.itens, it] };
                            return x;
                          }));
                        }}
                        className="rounded border px-1 py-0.5"
                        aria-label="Categoria"
                      >
                        {menu.map((x, j) => <option key={j} value={j}>{x.nome}</option>)}
                      </select>
                    )}
                    {existing.has(norm(it.nome)) && !(removeExample && exampleNames.has(norm(it.nome))) && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">já existe, não será criado</span>}
                    <button
                      className="ml-auto text-red-600 underline"
                      onClick={() => setMenu((m) => m.map((x, j) => (j === ci ? { ...x, itens: x.itens.filter((_, k) => k !== ii) } : x)))}
                    >
                      Tirar
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          ))}
        </>
      )}

      {kind === 'TABLES' && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">Quantidade<input value={tables.quantidade} inputMode="numeric" onChange={(e) => setTables({ ...tables, quantidade: e.target.value })} className="w-full rounded-md border px-2 py-1" /></label>
            <label className="space-y-1">Começa no número<input value={tables.inicio} inputMode="numeric" onChange={(e) => setTables({ ...tables, inicio: e.target.value })} className="w-full rounded-md border px-2 py-1" /></label>
            <label className="space-y-1">Área<input value={tables.area} onChange={(e) => setTables({ ...tables, area: e.target.value })} className="w-full rounded-md border px-2 py-1" /></label>
            <label className="space-y-1">Lugares por mesa<input value={tables.lugares} inputMode="numeric" onChange={(e) => setTables({ ...tables, lugares: e.target.value })} className="w-full rounded-md border px-2 py-1" /></label>
          </div>
          {Number.isFinite(tablesEnd) && tablesEnd >= Number(tables.inicio) && (
            <p className="text-sm">Mesas {tables.inicio} a {tablesEnd}, {tables.area}, {tables.lugares} lugares</p>
          )}
          {skippedNumbers.length > 0 && (
            <p className="text-xs text-muted-foreground">Já existem e serão puladas: {skippedNumbers.join(', ')}</p>
          )}
          {data.marks.exampleTables > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={removeExample} onChange={(e) => setRemoveExample(e.target.checked)} className="h-4 w-4 accent-primary" />
              Remover as mesas de exemplo ({data.marks.exampleTables})
            </label>
          )}
        </Card>
      )}

      {kind === 'STAFF' && (
        <>
          {data.marks.usersLimit && !data.marks.usersLimit.allowed && (
            <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Seu plano permite {data.marks.usersLimit.limit} {data.marks.usersLimit.limit === 1 ? 'usuário' : 'usuários'} (hoje {data.marks.usersLimit.current}). Quem passar do limite não será cadastrado.
            </Card>
          )}
          {people.map((p, i) => {
            const emailBad = !EMAIL.test(p.email.trim());
            return (
              <Card key={i} className="p-3 space-y-2">
                <input value={p.nome} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} className="w-full rounded-md border px-2 py-1 text-sm" aria-label="Nome" />
                <input
                  value={p.email}
                  type="email"
                  placeholder="E-mail (obrigatório)"
                  onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                  className={`w-full rounded-md border px-2 py-1 text-sm ${emailBad ? 'border-red-400' : ''}`}
                  aria-label="E-mail"
                />
                <div className="flex items-center gap-2 text-sm">
                  <select value={p.papel} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, papel: e.target.value as Papel } : x)))} className="rounded-md border px-2 py-1">
                    {(data.marks.assignable as Papel[]).map((r) => <option key={r} value={r}>{PAPEL_LABEL[r]}</option>)}
                    {!data.marks.assignable.includes(p.papel) && <option value={p.papel}>{PAPEL_LABEL[p.papel]} (você não pode dar)</option>}
                  </select>
                  <button className="ml-auto text-xs text-red-600 underline" onClick={() => setPeople((l) => l.filter((_, j) => j !== i))}>Tirar</button>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white p-3">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button className="flex-1" onClick={confirm} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar'}</Button>
          <Button variant="outline" onClick={discard} disabled={busy}>Descartar</Button>
        </div>
      </div>
    </div>
  );
}
