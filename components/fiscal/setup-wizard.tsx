'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Copy, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ORIGIN_LABELS, SUPPORTED_CSOSN } from '@/lib/nfe/fiscal-data';
import { FISCAL_STEPS, accountantMessage, fiscalSetupProgress } from '@/lib/nfe/setup-steps';

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const CHECKLIST = [
  { key: 'ie', label: 'CNPJ com Inscrição Estadual', help: 'A NFC-e é nota estadual: sem IE a SEFAZ recusa. Está no cartão de inscrição estadual ou com o contador.' },
  { key: 'a1', label: 'Certificado digital A1 (arquivo .pfx) e a senha', help: 'O A3 (cartão ou token USB) não serve. Quem emitiu o certificado ou o contador tem o arquivo.' },
  { key: 'focus', label: 'Conta na Focus NFe com a empresa cadastrada e o certificado enviado', help: 'focusnfe.com.br: cadastre a empresa, ligue a NFC-e e envie o A1. O certificado fica na Focus, não no Gastrux.' },
  { key: 'csc', label: 'CSC gerado no site da SEFAZ do seu estado', help: 'O código de segurança da NFC-e. Gere o de homologação (teste) e o de produção e cadastre os dois na Focus.' },
  { key: 'contador', label: 'Tributação padrão passada pelo contador', help: 'NCM, CFOP, origem, CSOSN e CST de PIS/COFINS. Na etapa 4 tem um texto pronto para mandar a ele.' },
] as const;

const input = 'w-full border rounded-lg px-3 py-2 text-sm';
const labelCls = 'text-xs font-medium text-gray-600 mb-1 block';

/**
 * Configuração fiscal guiada (2026-10-26): five steps, each saved when you move on, so it can be left and resumed.
 * The emission itself is unchanged (lib/nfe); only Focus NFe is wired.
 */
export function FiscalSetupWizard({ config, pending, onSaved, onIssued }: {
  config: any | null;
  pending: any | null;
  onSaved: (config: any) => void;
  onIssued: () => void;
}) {
  const progress = fiscalSetupProgress(config);
  const [step, setStep] = useState(progress.resumeAt);
  const [form, setForm] = useState<any>(config ?? { uf: 'SP', crt: '1', environment: 'sandbox', autoIssueOnSale: true });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; warn?: boolean } | null>(null);

  useEffect(() => {
    try { setChecked(JSON.parse(localStorage.getItem('gx-fiscal-checklist') || '{}')); } catch {}
  }, []);
  const toggle = (key: string) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    try { localStorage.setItem('gx-fiscal-checklist', JSON.stringify(next)); } catch {}
  };
  const set = (patch: Record<string, unknown>) => setForm({ ...form, ...patch });

  const STEP_FIELDS: Record<number, string[]> = {
    1: ['cnpj', 'stateRegistration', 'companyName', 'tradeName', 'uf', 'crt'],
    2: ['nfeApiKey', 'environment'],
    3: ['defaultNcm', 'defaultCfop', 'defaultOrigin', 'defaultCsosn', 'pisCofinsCst'],
    4: ['autoIssueOnSale', 'seriesNFCe'],
  };

  /** Saves the fields of a step; the first save creates the configuration (it needs the CNPJ) */
  const save = async (fields: string[]): Promise<boolean> => {
    const body: Record<string, unknown> = {};
    for (const f of fields) if (form[f] !== undefined) body[f] = form[f];
    if (!config && !String(form.cnpj ?? '').replace(/\D/g, '')) { toast.error('Comece pelo CNPJ da empresa'); return false; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fiscal/config', {
        method: config ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config ? body : { ...form, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar'); return false; }
      onSaved(data.config);
      setForm({ ...form, ...data.config });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (STEP_FIELDS[step] && !(await save(STEP_FIELDS[step]))) return;
    setStep(Math.min(step + 1, FISCAL_STEPS.length - 1));
  };

  const issueTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/fiscal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: 'NFCe', paymentMethod: 'dinheiro', items: [{ description: 'Teste de configuração', quantity: 1, unitPrice: 1 }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setTestResult({ ok: false, text: data.error || 'A nota de teste não foi emitida' });
      // A simulated note proves only that the data was accepted here, never that the SEFAZ authorizes it
      else if (data.simulated) setTestResult({ ok: true, warn: true, text: 'Nota simulada: os dados foram aceitos, mas este servidor não envia notas de teste para a SEFAZ. A confirmação de verdade é a primeira nota em Produção (confira em Documentos).' });
      else if (data.status === 'authorized') setTestResult({ ok: true, text: 'Nota de teste autorizada. A configuração está funcionando.' });
      else if (data.status === 'processing' || data.status === 'submitted') setTestResult({ ok: true, text: 'Nota enviada, esperando a SEFAZ. Confira o status em Documentos daqui a pouco.' });
      else setTestResult({ ok: false, text: `Nota recusada: ${data.rejectionReason || 'veja o motivo em Documentos'}` });
      onIssued();
    } finally {
      setTesting(false);
    }
  };

  const live = fiscalSetupProgress(form.cnpj ? form : config);
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(accountantMessage(form)); toast.success('Texto copiado: cole no WhatsApp ou no e-mail do contador'); }
    catch { toast.error('Não foi possível copiar: selecione o texto e copie'); }
  };

  return (
    <div className="space-y-6">
      {/* The steps */}
      <ol className="flex flex-wrap gap-2" aria-label="Etapas">
        {FISCAL_STEPS.map((s, i) => {
          const done = i === 1 ? live.done.empresa : i === 2 ? live.done.emissor : i === 3 ? live.done.tributacao : i === 4 ? live.ready : false;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={step === i ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs sm:text-sm ${step === i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-900'}`}
              >
                {done ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 opacity-50" />}
                {i + 1}. {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">Antes de começar, junte o que está abaixo. Pode marcar o que já tem; dá para seguir mesmo sem tudo e voltar depois.</p>
          <ul className="space-y-2">
            {CHECKLIST.map((c) => (
              <li key={c.key} className="border rounded-lg p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={!!checked[c.key]} onChange={() => toggle(c.key)} />
                  <span>
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block text-xs text-gray-500">{c.help}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 1 && (
        <section className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="fx-cnpj" className={labelCls}>CNPJ *</label>
            <input id="fx-cnpj" className={input} inputMode="numeric" placeholder="00.000.000/0000-00" value={form.cnpj || ''} onChange={(e) => set({ cnpj: e.target.value })} />
          </div>
          <div>
            <label htmlFor="fx-ie" className={labelCls}>Inscrição Estadual *</label>
            <input id="fx-ie" className={input} value={form.stateRegistration || ''} onChange={(e) => set({ stateRegistration: e.target.value })} />
          </div>
          <div>
            <label htmlFor="fx-razao" className={labelCls}>Razão social *</label>
            <input id="fx-razao" className={input} value={form.companyName || ''} onChange={(e) => set({ companyName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="fx-fantasia" className={labelCls}>Nome fantasia</label>
            <input id="fx-fantasia" className={input} value={form.tradeName || ''} onChange={(e) => set({ tradeName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="fx-uf" className={labelCls}>UF *</label>
            <select id="fx-uf" className={input} value={form.uf || 'SP'} onChange={(e) => set({ uf: e.target.value })}>
              {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="fx-crt" className={labelCls}>Regime tributário *</label>
            <select id="fx-crt" className={input} value={form.crt || '1'} onChange={(e) => set({ crt: e.target.value })}>
              <option value="1">Simples Nacional</option>
              <option value="2">Simples Nacional, acima do sublimite</option>
              <option value="3">Regime Normal (Lucro Presumido ou Real)</option>
            </select>
            {form.crt === '3' && <p className="text-xs text-red-600 mt-1">Hoje o Gastrux só emite NFC-e no Simples Nacional. Fale com a gente antes de seguir.</p>}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">
            O Gastrux emite pela <strong>Focus NFe</strong>. No painel da Focus, abra a sua empresa e copie o <strong>token</strong>: o de homologação serve para
            testar, o de produção para as notas de verdade. O certificado A1 e o CSC ficam cadastrados lá, não aqui.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="fx-token" className={labelCls}>Token da Focus NFe *</label>
              <input id="fx-token" className={input} type="password" autoComplete="off" placeholder="Cole o token aqui" value={form.nfeApiKey || ''} onChange={(e) => set({ nfeApiKey: e.target.value })} />
              {config?.nfeApiKey && <p className="text-xs text-gray-500 mt-1">Já salvo (termina em {String(config.nfeApiKey).slice(-4)}). Cole outro só para trocar.</p>}
            </div>
            <div>
              <label htmlFor="fx-env" className={labelCls}>Ambiente</label>
              <select id="fx-env" className={input} value={form.environment || 'sandbox'} onChange={(e) => set({ environment: e.target.value })}>
                <option value="sandbox">Teste (homologação): a nota não vale</option>
                <option value="production">Produção: notas de verdade</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">Comece em Teste com o token de homologação. Quando a nota de teste sair autorizada (etapa 5), troque para Produção e cole o token de produção.</p>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className="text-sm text-gray-600">
            Quem passa estes dados é o <strong>contador</strong>. Eles valem para os produtos sem dados fiscais próprios. Sem eles a NFC-e não sai: o Gastrux
            não inventa NCM nem tributação.
          </p>
          <div className="rounded-lg border bg-gray-50 dark:bg-gray-900 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Texto para mandar ao contador</p>
            <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{accountantMessage(form)}</pre>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={copyMessage}><Copy className="w-4 h-4" /> Copiar</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="fiscal-default-ncm" className={labelCls}>NCM</label>
              <input id="fiscal-default-ncm" inputMode="numeric" placeholder="8 dígitos" className={input} value={form.defaultNcm || ''} onChange={(e) => set({ defaultNcm: e.target.value })} />
            </div>
            <div>
              <label htmlFor="fiscal-default-cfop" className={labelCls}>CFOP</label>
              <input id="fiscal-default-cfop" inputMode="numeric" placeholder="ex.: 5102" className={input} value={form.defaultCfop || ''} onChange={(e) => set({ defaultCfop: e.target.value })} />
            </div>
            <div>
              <label htmlFor="fiscal-default-origin" className={labelCls}>Origem</label>
              <select id="fiscal-default-origin" className={input} value={form.defaultOrigin || ''} onChange={(e) => set({ defaultOrigin: e.target.value })}>
                <option value="">—</option>
                {Object.entries(ORIGIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fiscal-default-csosn" className={labelCls}>CSOSN</label>
              <select id="fiscal-default-csosn" className={input} value={form.defaultCsosn || ''} onChange={(e) => set({ defaultCsosn: e.target.value })}>
                <option value="">—</option>
                {SUPPORTED_CSOSN.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fiscal-pis-cofins" className={labelCls}>CST de PIS/COFINS</label>
              <input id="fiscal-pis-cofins" inputMode="numeric" placeholder="2 dígitos" className={input} value={form.pisCofinsCst || ''} onChange={(e) => set({ pisCofinsCst: e.target.value })} />
            </div>
          </div>
          {config && pending && (pending.blockedReason || pending.pending?.length > 0) && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {pending.blockedReason ? pending.blockedReason : `${pending.pending.length} de ${pending.total} produtos não sairiam na NFC-e hoje:`}
              </p>
              {!pending.blockedReason && (
                <ul className="flex flex-wrap gap-2 mt-1">
                  {pending.pending.slice(0, 40).map((p: any) => <li key={p.id}><a className="underline" href={`/receitas/${p.id}`}>{p.name}</a></li>)}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <ul className="space-y-2">
            {([
              [1, 'Empresa', live.missing.empresa],
              [2, 'Emissor (Focus NFe)', live.missing.emissor],
              [3, 'Tributação (contador)', live.missing.tributacao],
            ] as const).map(([i, title, missing]) => (
              <li key={title} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                <span className="flex items-start gap-2 text-sm">
                  {missing.length ? <XCircle className="w-5 h-5 text-red-500 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                  <span>
                    <span className="font-medium">{title}</span>
                    {missing.length > 0 && <span className="block text-xs text-red-600">Falta: {missing.join(', ')}</span>}
                  </span>
                </span>
                {missing.length > 0 && <Button size="sm" variant="outline" onClick={() => setStep(i)}>Completar</Button>}
              </li>
            ))}
          </ul>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm border rounded-lg p-3 cursor-pointer">
              <input type="checkbox" checked={form.autoIssueOnSale ?? true} onChange={(e) => set({ autoIssueOnSale: e.target.checked })} />
              Emitir a NFC-e sozinho ao fechar cada venda
            </label>
            <div>
              <label htmlFor="fx-serie" className={labelCls}>Série da NFC-e (a mesma cadastrada na Focus)</label>
              <input id="fx-serie" type="number" min={1} className={input} value={form.seriesNFCe || 1} onChange={(e) => set({ seriesNFCe: parseInt(e.target.value) || 1 })} />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">Nota de teste</p>
            {(form.environment || 'sandbox') === 'sandbox' ? (
              <>
                <p className="text-xs text-gray-500">Emite uma NFC-e de R$ 1,00 em homologação (não vale como nota). Se ela sair autorizada, a empresa, o certificado, o CSC e a tributação estão certos.</p>
                <Button size="sm" disabled={!live.ready || testing} onClick={issueTest}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Emitir nota de teste
                </Button>
                {!live.ready && <p className="text-xs text-gray-500">Complete as etapas acima para testar.</p>}
              </>
            ) : (
              <p className="text-xs text-gray-500">Em Produção não há nota de teste: a primeira nota sai na primeira venda. Confira em Documentos.</p>
            )}
            {testResult && <p className={`text-sm ${testResult.warn ? 'text-amber-700' : testResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testResult.text}</p>}
          </div>
        </section>
      )}

      <div className="flex justify-between gap-2 pt-2 border-t">
        <Button variant="ghost" disabled={step === 0 || saving} onClick={() => setStep(step - 1)}>Voltar</Button>
        {step < FISCAL_STEPS.length - 1 ? (
          <Button disabled={saving} onClick={next}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {step === 0 ? 'Começar' : 'Salvar e continuar'}
          </Button>
        ) : (
          <Button disabled={saving} onClick={async () => { if (await save(STEP_FIELDS[4])) toast.success('Configuração fiscal salva'); }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Salvar
          </Button>
        )}
      </div>
    </div>
  );
}
