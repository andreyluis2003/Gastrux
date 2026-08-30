'use client';

import { useState } from 'react';
import { Button, Card, Input, Label } from '@/components/ui';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SurveyData {
  currentSystem: string;
  painPoints: string[];
  willingnessToPayRaw: string;
  mostImportantFeature: string;
  businessUnits: string;
  willingToTalk: boolean;
  contactInfo?: string;
}

export default function SurveyPage() {
  const [section, setSection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [startTime] = useState(Date.now());

  const [formData, setFormData] = useState<SurveyData>({
    currentSystem: '',
    painPoints: [],
    willingnessToPayRaw: '',
    mostImportantFeature: '',
    businessUnits: '',
    willingToTalk: false,
  });

  const totalSections = 3;
  const progress = (section / totalSections) * 100;

  const handleSubmit = async () => {
    if (!formData.currentSystem) {
      toast.error('Por favor preencha todos os campos');
      return;
    }

    setLoading(true);
    const completionTime = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await fetch('/api/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          completedInSeconds: completionTime,
        }),
      });

      if (!response.ok) throw new Error('Erro ao enviar survey');

      setCompleted(true);
      toast.success('Obrigado! Sua resposta foi registrada');
    } catch (error) {
      toast.error('Erro ao enviar resposta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <Card className="max-w-md text-center p-8">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Obrigado!</h1>
          <p className="text-gray-600 mb-6">Sua resposta foi registrada com sucesso.</p>
          <Button onClick={() => (window.location.href = '/dashboard')} className="w-full">
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pesquisa Rápida</h1>
          <p className="text-gray-600">Ajude-nos a entender suas necessidades</p>
        </div>

        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Progresso: {Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        <Card className="p-6 mb-6">
          {section === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Qual sistema você usa atualmente?</h2>
              {['manual', 'spreadsheet', 'pos'].map(option => (
                <label key={option} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-blue-50">
                  <input
                    type="radio"
                    value={option}
                    checked={formData.currentSystem === option}
                    onChange={e => setFormData({ ...formData, currentSystem: e.target.value })}
                    className="w-4 h-4 mr-3"
                  />
                  <span className="text-gray-900">
                    {option === 'manual' && 'Totalmente manual'}
                    {option === 'spreadsheet' && 'Planilhas'}
                    {option === 'pos' && 'Sistema POS'}
                  </span>
                </label>
              ))}
            </div>
          )}

          {section === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Quanto você pagaria por uma solução ideal?</h2>
              {['none', '50', '100', '200', '500'].map(option => (
                <button
                  key={option}
                  onClick={() => setFormData({ ...formData, willingnessToPayRaw: option })}
                  className={`w-full p-4 border-2 rounded-lg text-left transition ${
                    formData.willingnessToPayRaw === option ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <span className="font-semibold text-gray-900">
                    {option === 'none' && 'Não pagaria'}
                    {option === '50' && 'R$ 50/mês'}
                    {option === '100' && 'R$ 100/mês'}
                    {option === '200' && 'R$ 200/mês'}
                    {option === '500' && 'R$ 500+/mês'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {section === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Posso falar com você depois?</h2>
              <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.willingToTalk}
                  onChange={e => setFormData({ ...formData, willingToTalk: e.target.checked })}
                  className="w-5 h-5 mr-3"
                />
                <span className="text-gray-900">Sim, gostaria de discutir mais</span>
              </label>
              {formData.willingToTalk && (
                <div>
                  <Label htmlFor="contact">Seu contato (WhatsApp/Email)</Label>
                  <Input
                    id="contact"
                    placeholder="(11) 98765-4321 ou seu@email.com"
                    value={formData.contactInfo || ''}
                    onChange={e => setFormData({ ...formData, contactInfo: e.target.value })}
                    className="mt-2"
                  />
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="flex gap-3 justify-between">
          <Button variant="outline" onClick={() => setSection(Math.max(1, section - 1))} disabled={section === 1}>
            Anterior
          </Button>

          {section < totalSections ? (
            <Button onClick={() => setSection(section + 1)}>
              Próximo
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="flex items-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>Enviar Resposta</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
