'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ORIGIN_LABELS, SUPPORTED_CSOSN, ST_CSOSN, validateProductFiscalFields } from '@/lib/nfe/fiscal-data';

interface FiscalFields {
  fiscalNcm?: string | null;
  fiscalCest?: string | null;
  fiscalCfop?: string | null;
  fiscalOrigin?: string | null;
  fiscalCsosn?: string | null;
}

/**
 * The product's own fiscal data on the NFC-e (launch plan item 3). Empty fields use the restaurant
 * defaults set in /admin/fiscal. Saving needs a manager; the server validates again.
 */
export function RecipeFiscalCard({ recipeId, initial }: { recipeId: string; initial: FiscalFields }) {
  const [form, setForm] = useState<FiscalFields>({
    fiscalNcm: initial.fiscalNcm ?? '',
    fiscalCest: initial.fiscalCest ?? '',
    fiscalCfop: initial.fiscalCfop ?? '',
    fiscalOrigin: initial.fiscalOrigin ?? '',
    fiscalCsosn: initial.fiscalCsosn ?? '',
  });
  const [saving, setSaving] = useState(false);
  const problems = validateProductFiscalFields(form);
  const needsCest = ST_CSOSN.includes(String(form.fiscalCsosn)) && !String(form.fiscalCest || '').trim();
  const set = (key: keyof FiscalFields) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/fiscal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar os dados fiscais');
        return;
      }
      toast.success('Dados fiscais salvos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="mb-1 text-lg font-semibold">Dados fiscais (NFC-e)</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Preenchidos pelo contador. Campos vazios usam a tributação padrão do restaurante (Admin › Fiscal).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="fiscal-ncm" className="mb-1 block text-xs font-medium">NCM</label>
          <Input id="fiscal-ncm" inputMode="numeric" placeholder="8 dígitos" value={form.fiscalNcm ?? ''} onChange={set('fiscalNcm')} />
        </div>
        <div>
          <label htmlFor="fiscal-cfop" className="mb-1 block text-xs font-medium">CFOP</label>
          <Input id="fiscal-cfop" inputMode="numeric" placeholder="ex.: 5102, 5405" value={form.fiscalCfop ?? ''} onChange={set('fiscalCfop')} />
        </div>
        <div>
          <label htmlFor="fiscal-origin" className="mb-1 block text-xs font-medium">Origem</label>
          <select id="fiscal-origin" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.fiscalOrigin ?? ''} onChange={set('fiscalOrigin')}>
            <option value="">Padrão do restaurante</option>
            {Object.entries(ORIGIN_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fiscal-csosn" className="mb-1 block text-xs font-medium">CSOSN</label>
          <select id="fiscal-csosn" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.fiscalCsosn ?? ''} onChange={set('fiscalCsosn')}>
            <option value="">Padrão do restaurante</option>
            {SUPPORTED_CSOSN.map((c) => <option key={c} value={c}>{c}{ST_CSOSN.includes(c) ? ' (subst. tributária)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fiscal-cest" className="mb-1 block text-xs font-medium">CEST</label>
          <Input id="fiscal-cest" inputMode="numeric" placeholder="7 dígitos" value={form.fiscalCest ?? ''} onChange={set('fiscalCest')} />
        </div>
      </div>
      {(problems.length > 0 || needsCest) && (
        <ul className="mt-3 list-disc pl-5 text-sm text-red-700 dark:text-red-400">
          {problems.map((p) => <li key={p}>{p}</li>)}
          {needsCest && <li>Com substituição tributária (CSOSN {form.fiscalCsosn}) o CEST é obrigatório</li>}
        </ul>
      )}
      <div className="mt-4">
        <Button onClick={save} disabled={saving || problems.length > 0}>
          {saving ? 'Salvando...' : 'Salvar dados fiscais'}
        </Button>
      </div>
    </Card>
  );
}
