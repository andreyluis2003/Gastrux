'use client';

import { useMemo, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { brl } from '@/components/caixa/money';

/** brl takes cents; the import works in reais */
const reais = (v: number) => brl(Math.round(v * 100));
import type { ImportedMenu } from '@/lib/cardapio/import/parse';

/** Same rounding as the server (lib/cardapio/import/apply.ts adjustPrice) */
const adjust = (preco: number, pct: number) => Math.max(0.01, Math.round(preco * (1 + pct / 100) * 100) / 100);

/**
 * Cardápio digital > Importar de um link (spec 2026-11-06 importar-cardapio-por-link): paste the store link,
 * review what was read, untick what should not come, change the prices by %, import.
 */
export function ImportFromLink({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<ImportedMenu | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState('0');
  const [photos, setPhotos] = useState(true);
  const [addons, setAddons] = useState(true);
  const [owner, setOwner] = useState(false);
  const [hasExample, setHasExample] = useState(false);
  const [removeExample, setRemoveExample] = useState(true);

  const pctNum = Number(pct.replace(',', '.'));
  const pctOk = Number.isFinite(pctNum) && pctNum >= -50 && pctNum <= 50;
  const chosen = useMemo(() => (menu ? menu.categorias.reduce((t, c) => t + c.itens.filter((i) => !off.has(i.ref)).length, 0) : 0), [menu, off]);

  const reset = () => { setMenu(null); setOff(new Set()); setPct('0'); setOwner(false); };

  const read = async () => {
    setBusy(true);
    try {
      const [res, ex] = await Promise.all([
        fetch('/api/cardapio/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ler', url }) }),
        fetch('/api/cardapio/importar', { cache: 'no-store' }),
      ]);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível ler a página'); return; }
      const m = body as ImportedMenu;
      setMenu(m);
      // Items unavailable at the source start unticked
      setOff(new Set(m.categorias.flatMap((c) => c.itens.filter((i) => !i.disponivel).map((i) => i.ref))));
      const e = await ex.json().catch(() => ({}));
      setHasExample(!!e.hasExample);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (ref: string) => setOff((s) => { const n = new Set(s); n.has(ref) ? n.delete(ref) : n.add(ref); return n; });
  const toggleCategory = (refs: string[], on: boolean) => setOff((s) => { const n = new Set(s); refs.forEach((r) => (on ? n.delete(r) : n.add(r))); return n; });

  const save = async () => {
    if (!menu) return;
    setBusy(true);
    try {
      const categorias = menu.categorias
        .map((c) => ({ nome: c.nome, itens: c.itens.filter((i) => !off.has(i.ref)).map((i) => ({ nome: i.nome, descricao: i.descricao, preco: i.preco, foto: photos ? i.foto : null, codigo: i.codigo })) }))
        .filter((c) => c.itens.length);
      const res = await fetch('/api/cardapio/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importar', categorias, adicionais: addons ? menu.adicionais : [], ajustePct: pctNum, removeExample: hasExample && removeExample, confirmaDono: owner }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível importar'); return; }
      const parts = [`${body.created} produtos importados`];
      if (body.addons) parts.push(`${body.addons} adicionais`);
      if (body.skipped?.length) parts.push(`${body.skipped.length} já existiam`);
      toast.success(parts.join(', '));
      setOpen(false);
      reset();
      setUrl('');
      onImported();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Link2 className="w-4 h-4" /> Importar de um link
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Importar o cardápio de um link</DialogTitle>
            <DialogDescription>
              Cole o link da página de pedidos da sua loja (por exemplo, Zé Pediu). Do iFood e do Anota AI não dá: mande
              um print ou o PDF do cardápio para a IA, no botão Pergunte ao Gastrux.
            </DialogDescription>
          </DialogHeader>

          {!menu && (
            <div className="flex gap-2">
              <Input placeholder="https://sualoja.com.br/pedidos" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !busy) read(); }} />
              <Button disabled={busy || !url.trim()} onClick={read}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ler cardápio'}
              </Button>
            </div>
          )}

          {menu && (
            <div className="space-y-4">
              <p className="text-sm">
                {menu.loja ? <strong>{menu.loja}</strong> : 'Cardápio lido'}: {menu.categorias.length} categorias,{' '}
                {menu.categorias.reduce((t, c) => t + c.itens.length, 0)} produtos. Desmarque o que não quer trazer.
              </p>

              {menu.categorias.map((c) => {
                const refs = c.itens.map((i) => i.ref);
                const allOn = refs.every((r) => !off.has(r));
                return (
                  <div key={c.nome} className="rounded border">
                    <label className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-sm font-medium">
                      <input type="checkbox" checked={allOn} onChange={(e) => toggleCategory(refs, e.target.checked)} />
                      {c.nome} <span className="font-normal text-muted-foreground">({c.itens.length})</span>
                    </label>
                    <ul className="divide-y">
                      {c.itens.map((i) => (
                        <li key={i.ref} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <input type="checkbox" checked={!off.has(i.ref)} onChange={() => toggle(i.ref)} aria-label={i.nome} />
                          {photos && i.foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.foto} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded bg-gray-100" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{i.nome}{!i.disponivel && <span className="text-muted-foreground"> (indisponível lá)</span>}</span>
                            {i.descricao && <span className="block truncate text-xs text-muted-foreground">{i.descricao}</span>}
                          </span>
                          <span className="shrink-0 text-right">
                            {pctOk && pctNum !== 0 && <span className="block text-xs text-muted-foreground line-through">{reais(i.preco)}</span>}
                            <span className="block font-medium">{reais(pctOk ? adjust(i.preco, pctNum) : i.preco)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              <div className="space-y-3 rounded border p-3 text-sm">
                <label className="flex flex-wrap items-center gap-2">
                  Ajustar os preços em
                  <Input className="h-8 w-20" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Ajuste em porcentagem" />
                  %
                  <span className="text-xs text-muted-foreground">(ex.: -10 para ficar 10% mais barato que no app)</span>
                </label>
                {!pctOk && <p className="text-xs text-red-600">Use um número de -50 a 50.</p>}
                <label className="flex items-center gap-2"><input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Trazer as fotos</label>
                {menu.adicionais.length > 0 && (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={addons} onChange={(e) => setAddons(e.target.checked)} /> Trazer os adicionais ({menu.adicionais.length})</label>
                )}
                {hasExample && (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={removeExample} onChange={(e) => setRemoveExample(e.target.checked)} /> Tirar o cardápio de exemplo</label>
                )}
                {addons && menu.avisos.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {menu.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                )}
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} /> Este cardápio é do meu restaurante</label>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={reset}>Usar outro link</Button>
                <Button disabled={busy || !owner || !pctOk || chosen === 0} onClick={save}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Importar ${chosen} produtos`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
