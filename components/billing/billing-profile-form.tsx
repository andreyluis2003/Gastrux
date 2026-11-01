'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMPTY = { document: '', name: '', zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' };
type Field = keyof typeof EMPTY;

/** Who the Gastrux invoice is made out to (lib/billing/billing-profile.ts). Staff get 403 and see nothing. */
export function BillingProfileForm({ submitLabel, onSaved }: { submitLabel: string; onSaved?: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/billing/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const start = d.profile ?? d.suggested ?? {};
        setForm((f) => {
          const next = { ...f };
          for (const k of Object.keys(EMPTY) as Field[]) next[k] = start[k] ?? '';
          return next;
        });
        setReady(true);
      })
      .catch(() => {});
  }, []);

  const set = (field: Field, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // The CEP fills what it knows (ViaCEP, public, as in the sign-up); everything stays editable
  async function lookUpCep(raw: string) {
    const cep = raw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const data = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json());
      if (data?.erro) return;
      setForm((f) => ({
        ...f,
        street: f.street || data.logradouro || '',
        neighborhood: f.neighborhood || data.bairro || '',
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      // Offline or ViaCEP down: filled by hand
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/billing/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível salvar. Tente de novo.');
        return;
      }
      toast.success('Dados da nota fiscal salvos');
      onSaved?.();
    } catch {
      toast.error('Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  const field = (name: Field, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div>
      <Label htmlFor={`billing-${name}`} className="text-xs">{label}</Label>
      <Input id={`billing-${name}`} className="mt-1" value={form[name]} onChange={(e) => set(name, e.target.value)} disabled={saving} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {field('document', 'CPF ou CNPJ', { required: true })}
      {field('name', 'Nome ou razão social', { required: true, maxLength: 150 })}
      {field('zipCode', 'CEP', { required: true, inputMode: 'numeric', onBlur: (e) => lookUpCep(e.target.value) })}
      {field('street', 'Rua', { required: true, maxLength: 150 })}
      <div className="grid grid-cols-2 gap-3">
        {field('number', 'Número', { required: true, maxLength: 20 })}
        {field('complement', 'Complemento (opcional)', { maxLength: 100 })}
      </div>
      {field('neighborhood', 'Bairro', { required: true, maxLength: 100 })}
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        {field('city', 'Cidade', { required: true, maxLength: 100 })}
        {field('state', 'UF', { required: true, maxLength: 2 })}
      </div>
      <Button type="submit" className="w-full" disabled={saving} loading={saving}>{submitLabel}</Button>
    </form>
  );
}
