'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = businessStage && locationCount && mainPainPoint;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/qualification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessStage, locationCount, mainPainPoint }),
      });
      if (!res.ok) {
        toast.error('Não deu pra salvar suas respostas, mas você já pode continuar');
      }
    } catch {
      toast.error('Não deu pra salvar suas respostas, mas você já pode continuar');
    } finally {
      router.replace('/dashboard');
    }
  }

  function handleSkip() {
    router.replace('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center space-y-2 text-center">
          <ChefHat className="h-10 w-10 text-red-600" />
          <h1 className="text-xl font-bold text-slate-900">Só mais 3 perguntinhas</h1>
          <p className="text-sm text-slate-600">
            Isso nos ajuda a preparar a melhor experiência pro seu tipo de negócio.
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
