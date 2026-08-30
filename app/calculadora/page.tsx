'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Calculator,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  DollarSign,
  Users,
  ShoppingCart,
  Building2,
  ChefHat,
  Share2,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

/* ── Benchmarks do setor (Brasil, food service) ── */
const BENCHMARKS = {
  cmvIdeal: { min: 0.28, max: 0.35 },
  folhaIdeal: 0.25,         // % da receita
  aluguelIdeal: 0.08,       // % da receita
  margemLiquidaIdeal: 0.12, // 12%
  diasPorMes: 26,
};

type Step = 'form' | 'result';

interface FormData {
  pratosPerDia: number | '';
  ticketMedio: number | '';
  comprasMes: number | '';
  funcionarios: number | '';
  aluguel: number | '';
  segmento: string;
}

const SEGMENTOS = [
  { value: 'restaurante', label: 'Restaurante / Self-service' },
  { value: 'pizzaria', label: 'Pizzaria' },
  { value: 'hamburgueria', label: 'Hamburgueria' },
  { value: 'delivery', label: 'Delivery / Dark Kitchen' },
  { value: 'bar', label: 'Bar / Pub' },
  { value: 'cafeteria', label: 'Cafeteria / Padaria' },
  { value: 'outro', label: 'Outro' },
];

function numVal(v: number | ''): number {
  return typeof v === 'number' ? v : 0;
}

export default function CalculadoraPage() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<FormData>({
    pratosPerDia: '',
    ticketMedio: '',
    comprasMes: '',
    funcionarios: '',
    aluguel: '',
    segmento: 'restaurante',
  });
  const [email, setEmail] = useState('');
  const [leadSent, setLeadSent] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Restaurar dados da URL se compartilhado
    const p = searchParams.get('p');
    const t = searchParams.get('t');
    const c = searchParams.get('c');
    const f = searchParams.get('f');
    const a = searchParams.get('a');
    const s = searchParams.get('s');
    if (p && t && c) {
      setForm({
        pratosPerDia: Number(p) || '',
        ticketMedio: Number(t) || '',
        comprasMes: Number(c) || '',
        funcionarios: Number(f) || '',
        aluguel: Number(a) || '',
        segmento: s || 'restaurante',
      });
      setStep('result');
    }
  }, [searchParams]);

  /* ── Cálculos ── */
  const results = useMemo(() => {
    const pratos = numVal(form.pratosPerDia);
    const ticket = numVal(form.ticketMedio);
    const compras = numVal(form.comprasMes);
    const func = numVal(form.funcionarios);
    const aluguel = numVal(form.aluguel);

    const faturamentoMes = pratos * ticket * BENCHMARKS.diasPorMes;
    const cmvReal = faturamentoMes > 0 ? compras / faturamentoMes : 0;
    const cmvIdeal = (BENCHMARKS.cmvIdeal.min + BENCHMARKS.cmvIdeal.max) / 2;
    const cmvExcesso = Math.max(0, cmvReal - cmvIdeal);
    const perdaMensal = cmvExcesso * faturamentoMes;
    const perdaAnual = perdaMensal * 12;

    // Custos estimados de folha (média R$2.200/func com encargos)
    const folhaEstimada = func * 2200;
    const folhaPct = faturamentoMes > 0 ? folhaEstimada / faturamentoMes : 0;

    const aluguelPct = faturamentoMes > 0 ? aluguel / faturamentoMes : 0;

    // Custos totais estimados
    const custosFixos = folhaEstimada + aluguel;
    const custosTotais = compras + custosFixos;
    const lucroEstimado = faturamentoMes - custosTotais;
    const margemLiquida = faturamentoMes > 0 ? lucroEstimado / faturamentoMes : 0;

    // Diagnóstico
    const diagnosticos: { tipo: 'danger' | 'warning' | 'ok'; texto: string }[] = [];

    if (cmvReal > 0.40) {
      diagnosticos.push({ tipo: 'danger', texto: `Seu CMV está em ${(cmvReal * 100).toFixed(0)}% — muito acima do ideal (28-35%). Você pode estar perdendo R$ ${perdaMensal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} por mês.` });
    } else if (cmvReal > 0.35) {
      diagnosticos.push({ tipo: 'warning', texto: `Seu CMV está em ${(cmvReal * 100).toFixed(0)}% — um pouco acima do ideal. Há espaço para economizar R$ ${perdaMensal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês.` });
    } else if (cmvReal > 0) {
      diagnosticos.push({ tipo: 'ok', texto: `Seu CMV está em ${(cmvReal * 100).toFixed(0)}% — dentro do ideal! Continue monitorando para manter.` });
    }

    if (folhaPct > 0.30) {
      diagnosticos.push({ tipo: 'warning', texto: `Folha de pagamento estimada em ${(folhaPct * 100).toFixed(0)}% do faturamento. O ideal é até 25%.` });
    }

    if (aluguelPct > 0.12) {
      diagnosticos.push({ tipo: 'warning', texto: `Aluguel representa ${(aluguelPct * 100).toFixed(0)}% do faturamento. Acima de 10% pode comprometer a margem.` });
    }

    if (margemLiquida < 0) {
      diagnosticos.push({ tipo: 'danger', texto: 'Seu restaurante pode estar operando no prejuízo. É urgente revisar custos e preços.' });
    } else if (margemLiquida < 0.08) {
      diagnosticos.push({ tipo: 'warning', texto: `Margem líquida estimada em ${(margemLiquida * 100).toFixed(0)}% — abaixo do ideal (12%+). Há espaço para melhorar.` });
    }

    return {
      faturamentoMes,
      cmvReal,
      cmvExcesso,
      perdaMensal,
      perdaAnual,
      folhaEstimada,
      folhaPct,
      aluguelPct,
      custosFixos,
      custosTotais,
      lucroEstimado,
      margemLiquida,
      diagnosticos,
    };
  }, [form]);

  const isFormValid =
    numVal(form.pratosPerDia) > 0 &&
    numVal(form.ticketMedio) > 0 &&
    numVal(form.comprasMes) > 0;

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams({
      p: String(numVal(form.pratosPerDia)),
      t: String(numVal(form.ticketMedio)),
      c: String(numVal(form.comprasMes)),
      f: String(numVal(form.funcionarios)),
      a: String(numVal(form.aluguel)),
      s: form.segmento,
    });
    return `${window.location.origin}/calculadora?${params.toString()}`;
  }, [form]);

  const handleCalculate = () => {
    if (isFormValid) setStep('result');
  };

  const handleCaptureLead = async () => {
    if (!email) return;
    setLeadLoading(true);
    try {
      await fetch('/api/marketing/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'CALCULATOR',
          sourceDetail: 'calculadora-lucro',
          email,
          segment: form.segmento,
          metadata: {
            pratosPerDia: numVal(form.pratosPerDia),
            ticketMedio: numVal(form.ticketMedio),
            comprasMes: numVal(form.comprasMes),
            funcionarios: numVal(form.funcionarios),
            aluguel: numVal(form.aluguel),
            faturamentoMes: results.faturamentoMes,
            cmvReal: results.cmvReal,
            perdaMensal: results.perdaMensal,
          },
        }),
      });
      setLeadSent(true);
    } catch {
      // silent
    } finally {
      setLeadLoading(false);
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Calculadora de Lucro — Gastrux',
          text: 'Descubra quanto seu restaurante está lucrando de verdade',
          url: shareUrl,
        });
      } catch { /* cancelled */ }
    } else if (typeof navigator !== 'undefined') {
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  const formatBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-orange-600 font-bold text-lg">
            <ChefHat className="h-6 w-6" /> Gastrux
          </Link>
          <Link href="/auth/signup">
            <Button size="sm">Criar conta grátis</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm font-medium mb-4">
            <Calculator className="h-4 w-4" /> Gratuito • Sem cadastro
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Você sabe se está{' '}
            <span className="text-orange-600">lucrando ou só girando dinheiro?</span>
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Responda 5 perguntas rápidas e descubra — o caderno não mostra isso, mas a calculadora mostra.
          </p>
        </div>

        {step === 'form' ? (
          /* ══════════ FORMULÁRIO ══════════ */
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 sm:p-8 max-w-2xl mx-auto">
            <div className="space-y-6">
              {/* Segmento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Building2 className="inline h-4 w-4 mr-1" /> Tipo do seu negócio
                </label>
                <select
                  value={form.segmento}
                  onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                >
                  {SEGMENTOS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Pratos por dia */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <ShoppingCart className="inline h-4 w-4 mr-1" /> Quantos pratos/pedidos você serve por dia?
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Ex: 80"
                  value={form.pratosPerDia}
                  onChange={(e) => setForm({ ...form, pratosPerDia: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>

              {/* Ticket Médio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <DollarSign className="inline h-4 w-4 mr-1" /> Qual seu ticket médio? (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Ex: 35"
                  value={form.ticketMedio}
                  onChange={(e) => setForm({ ...form, ticketMedio: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>

              {/* Compras/mês */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <ShoppingCart className="inline h-4 w-4 mr-1" /> Quanto gasta em compras por mês? (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Ex: 25000"
                  value={form.comprasMes}
                  onChange={(e) => setForm({ ...form, comprasMes: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>

              {/* Funcionários */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Users className="inline h-4 w-4 mr-1" /> Quantos funcionários tem?
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Ex: 5"
                  value={form.funcionarios}
                  onChange={(e) => setForm({ ...form, funcionarios: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>

              {/* Aluguel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Building2 className="inline h-4 w-4 mr-1" /> Quanto paga de aluguel? (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Ex: 5000"
                  value={form.aluguel}
                  onChange={(e) => setForm({ ...form, aluguel: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>

              <Button
                onClick={handleCalculate}
                disabled={!isFormValid}
                className="w-full py-6 text-lg rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Calculator className="h-5 w-5 mr-2" />
                Ver meu diagnóstico grátis
              </Button>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Seus dados não são armazenados. O cálculo é feito no seu navegador.
              </p>
            </div>
          </div>
        ) : (
          /* ══════════ RESULTADO ══════════ */
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Faturamento estimado"
                value={formatBRL(results.faturamentoMes)}
                sub="/mês"
                icon={<DollarSign className="h-5 w-5" />}
                color="blue"
              />
              <KpiCard
                label="CMV real"
                value={`${(results.cmvReal * 100).toFixed(0)}%`}
                sub={results.cmvReal > 0.35 ? 'Acima do ideal' : 'Dentro do ideal'}
                icon={<ShoppingCart className="h-5 w-5" />}
                color={results.cmvReal > 0.35 ? 'red' : 'green'}
              />
              <KpiCard
                label="Lucro estimado"
                value={formatBRL(results.lucroEstimado)}
                sub="/mês"
                icon={results.lucroEstimado >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                color={results.lucroEstimado >= 0 ? 'green' : 'red'}
              />
              <KpiCard
                label="Margem líquida"
                value={`${(results.margemLiquida * 100).toFixed(0)}%`}
                sub={results.margemLiquida >= 0.12 ? 'Saudável' : 'Abaixo do ideal'}
                icon={<TrendingUp className="h-5 w-5" />}
                color={results.margemLiquida >= 0.12 ? 'green' : 'amber'}
              />
            </div>

            {/* Perda potencial highlight */}
            {results.perdaMensal > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
                <TrendingDown className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">
                  Você pode estar perdendo
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-red-700 dark:text-red-300">
                  {formatBRL(results.perdaMensal)}<span className="text-lg font-normal">/mês</span>
                </p>
                <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                  = {formatBRL(results.perdaAnual)} por ano em CMV acima do ideal
                </p>
              </div>
            )}

            {/* Diagnósticos */}
            {results.diagnosticos.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Diagnóstico
                </h3>
                <div className="space-y-3">
                  {results.diagnosticos.map((d, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl ${
                        d.tipo === 'danger'
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                          : d.tipo === 'warning'
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                          : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      }`}
                    >
                      {d.tipo === 'ok' ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm">{d.texto}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Breakdown visual */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Composição dos custos</h3>
              <div className="space-y-3">
                <CostBar
                  label="CMV (Compras)"
                  value={numVal(form.comprasMes)}
                  total={results.faturamentoMes}
                  color="bg-red-500"
                  formatBRL={formatBRL}
                />
                <CostBar
                  label="Folha estimada"
                  value={results.folhaEstimada}
                  total={results.faturamentoMes}
                  color="bg-blue-500"
                  formatBRL={formatBRL}
                />
                <CostBar
                  label="Aluguel"
                  value={numVal(form.aluguel)}
                  total={results.faturamentoMes}
                  color="bg-purple-500"
                  formatBRL={formatBRL}
                />
                <CostBar
                  label="Lucro"
                  value={Math.max(0, results.lucroEstimado)}
                  total={results.faturamentoMes}
                  color="bg-green-500"
                  formatBRL={formatBRL}
                />
              </div>
            </div>

            {/* Lead capture */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-6 sm:p-8">
              {!leadSent ? (
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Quer parar de adivinhar e ver o lucro real?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Troque o caderno pela Gastrux — em 10 minutos você vê o custo de cada prato.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-4">
                    <input
                      type="email"
                      placeholder="Seu melhor email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                    />
                    <Button
                      onClick={handleCaptureLead}
                      disabled={!email || leadLoading}
                      className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-6"
                    >
                      {leadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                      Receber dicas
                    </Button>
                  </div>
                  <Link href="/auth/signup">
                    <Button variant="outline" className="rounded-xl">
                      Criar conta grátis <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Pronto! Vamos te enviar dicas personalizadas
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Enquanto isso, crie sua conta gratuita para ver o diagnóstico completo.
                  </p>
                  <Link href="/auth/signup">
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl">
                      Criar conta grátis <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => setStep('form')}
                className="rounded-xl"
              >
                Recalcular
              </Button>
              <Button
                variant="outline"
                onClick={handleShare}
                className="rounded-xl"
              >
                <Share2 className="h-4 w-4 mr-2" /> Compartilhar resultado
              </Button>
            </div>
          </div>
        )}

        {/* Social proof */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            +500 donos de restaurante já trocaram o caderno pela Gastrux
          </p>
          <div className="flex items-center justify-center gap-6 text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">500+</p>
              <p className="text-xs">Restaurantes</p>
            </div>
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">R$ 2M+</p>
              <p className="text-xs">Economizados</p>
            </div>
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">4.8★</p>
              <p className="text-xs">Avaliação</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Sub-componentes ── */
function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${colors[color]} mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

function CostBar({
  label,
  value,
  total,
  color,
  formatBRL,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  formatBRL: (v: number) => string;
}) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">
          {formatBRL(value)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
