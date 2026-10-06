'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEGMENTS } from '@/lib/marketing/segments';

// Reuses the marketing segment taxonomy so answers stay consistent with
// /para/[segmento], minus 'delivery'/'franquias' - those are a business
// model/channel, not a cuisine/format, and don't belong in this list.
const BUSINESS_TYPE_OPTIONS = SEGMENTS.filter((s) => !['delivery', 'franquias'].includes(s.slug)).map((s) => ({
  value: s.slug,
  label: `${s.emoji} ${s.shortName}`,
}));

const BUSINESS_STAGE_OPTIONS = [
  { value: 'operating', label: 'Já tenho um restaurante/negócio de alimentação em operação' },
  { value: 'opening_soon', label: 'Vou abrir em breve' },
  { value: 'just_researching', label: 'Não, só estou pesquisando' },
];

const LOCATION_COUNT_OPTIONS = [
  { value: '1', label: '1 unidade' },
  { value: '2_5', label: '2 a 5 unidades' },
  { value: '6_plus', label: '6 ou mais unidades' },
];

const PAIN_POINT_OPTIONS = [
  { value: 'estoque', label: 'Controle de estoque' },
  { value: 'cmv', label: 'Custo de receita / CMV' },
  { value: 'caixa', label: 'Caixa e vendas' },
  { value: 'outro', label: 'Outro' },
];

type AddressField = 'zipCode' | 'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'state';
const EMPTY_ADDRESS: Record<AddressField, string> = { zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' };

function ChoiceStep({
  title,
  options,
  value,
  onSelect,
}: {
  title: string;
  options: { value: string; label: string }[];
  value: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={cn(
              'w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition',
              value === opt.value
                ? 'border-red-600 bg-red-50 text-red-700'
                : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QualificationPage() {
  const router = useRouter();
  const [businessStage, setBusinessStage] = useState<string | null>(null);
  const [locationCount, setLocationCount] = useState<string | null>(null);
  const [mainPainPoint, setMainPainPoint] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  // "Comece com" (2026-10-06): the example menu of the chosen business type, or nothing
  const [startWith, setStartWith] = useState<'template' | 'blank'>('template');
  const [address, setAddress] = useState<Record<AddressField, string>>(EMPTY_ADDRESS);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = businessStage && locationCount && mainPainPoint && businessType;
  const typeLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.value === businessType)?.label;

  function setField(field: AddressField, value: string) {
    setAddress((a) => ({ ...a, [field]: value }));
  }

  // The CEP fills street, neighbourhood, city and state (ViaCEP, public); the owner can still edit them
  async function lookUpCep(raw: string) {
    const cep = raw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setLookingUpCep(true);
    try {
      const data = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json());
      if (data?.erro) {
        toast.error('CEP não encontrado. Confira ou preencha o endereço à mão.');
        return;
      }
      setAddress((a) => ({
        ...a,
        street: a.street || data.logradouro || '',
        neighborhood: a.neighborhood || data.bairro || '',
        city: data.localidade || a.city,
        state: data.uf || a.state,
      }));
    } catch {
      // Offline or ViaCEP down: the fields stay editable by hand
    } finally {
      setLookingUpCep(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/qualification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessStage, businessType, locationCount, mainPainPoint, startWith, address }),
      });
      if (res.status === 400) {
        // A half-filled address: say what is missing and stay on the page
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Confira suas respostas');
        setSubmitting(false);
        return;
      }
      if (!res.ok) toast.error('Não deu pra salvar suas respostas, mas você já pode continuar');
    } catch {
      toast.error('Não deu pra salvar suas respostas, mas você já pode continuar');
    }
    router.replace('/dashboard');
  }

  // Skipping keeps the general example menu, so the dashboard is never empty on the first visit
  async function handleSkip() {
    setSubmitting(true);
    try {
      await fetch('/api/onboarding/qualification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      });
    } catch {
      // The examples are a convenience: never block the way in
    }
    router.replace('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center space-y-2 text-center">
          <ChefHat className="h-10 w-10 text-red-600" />
          <h1 className="text-xl font-bold text-slate-900">Vamos preparar o seu restaurante</h1>
          <p className="text-sm text-slate-600">
            Umas perguntas rápidas e o Gastrux já começa com o cardápio do seu tipo de negócio.
          </p>
        </div>

        <ChoiceStep
          title="Você já tem um restaurante em operação?"
          options={BUSINESS_STAGE_OPTIONS}
          value={businessStage}
          onSelect={setBusinessStage}
        />

        <ChoiceStep
          title="Quantas unidades/lojas?"
          options={LOCATION_COUNT_OPTIONS}
          value={locationCount}
          onSelect={setLocationCount}
        />

        <ChoiceStep
          title="Qual seu maior problema hoje?"
          options={PAIN_POINT_OPTIONS}
          value={mainPainPoint}
          onSelect={setMainPainPoint}
        />

        <ChoiceStep
          title="Qual o tipo do seu negócio?"
          options={BUSINESS_TYPE_OPTIONS}
          value={businessType}
          onSelect={setBusinessType}
        />

        <ChoiceStep
          title="Como quer começar?"
          options={[
            {
              value: 'template',
              label: businessType
                ? `Com um cardápio de exemplo de ${typeLabel?.replace(/^\S+\s/, '').toLowerCase()}: pratos, fichas técnicas e custos prontos para ajustar`
                : 'Com um cardápio de exemplo do meu tipo de negócio, pronto para ajustar',
            },
            { value: 'blank', label: 'Em branco: vou cadastrar tudo do meu jeito' },
          ]}
          value={startWith}
          onSelect={(v) => setStartWith(v as 'template' | 'blank')}
        />

        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Endereço do restaurante</h2>
            <p className="text-xs text-slate-500">
              Usado na nota fiscal e na taxa de entrega. Pode deixar em branco e preencher depois.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              aria-label="CEP"
              placeholder={lookingUpCep ? 'Buscando...' : 'CEP'}
              inputMode="numeric"
              value={address.zipCode}
              onChange={(e) => setField('zipCode', e.target.value)}
              onBlur={(e) => lookUpCep(e.target.value)}
              className="col-span-1"
            />
            <Input aria-label="Rua" placeholder="Rua" value={address.street} onChange={(e) => setField('street', e.target.value)} className="col-span-2" />
            <Input aria-label="Número" placeholder="Número" value={address.number} onChange={(e) => setField('number', e.target.value)} />
            <Input aria-label="Complemento" placeholder="Complemento" value={address.complement} onChange={(e) => setField('complement', e.target.value)} className="col-span-2" />
            <Input aria-label="Bairro" placeholder="Bairro" value={address.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} className="col-span-3" />
            <Input aria-label="Cidade" placeholder="Cidade" value={address.city} onChange={(e) => setField('city', e.target.value)} className="col-span-2" />
            <Input aria-label="UF" placeholder="UF" maxLength={2} value={address.state} onChange={(e) => setField('state', e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Button className="w-full" disabled={!canSubmit || submitting} loading={submitting} onClick={handleSubmit}>
            Continuar
          </Button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full text-center text-sm text-slate-500 hover:underline"
          >
            Pular por enquanto
          </button>
        </div>
      </div>
    </div>
  );
}
