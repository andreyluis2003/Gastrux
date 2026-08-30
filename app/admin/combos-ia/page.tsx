'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Pin,
  PinOff,
  Trash2,
  RefreshCw,
  Package,
  TrendingUp,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ComboInsight {
  id: string;
  title: string;
  summary: string;
  content: string;
  pinned: boolean;
  dismissed: boolean;
  dataSnapshot: {
    items: Array<{ name: string; price: number }>;
    originalPrice: number;
    comboPrice: number;
    discountPercent: number;
  };
  createdAt: string;
}

export default function CombosIAPage() {
  const [combos, setCombos] = useState<ComboInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchCombos = async () => {
    try {
      const res = await fetch('/api/ai-insights/combos');
      const data = await res.json();
      setCombos(data.combos || []);
    } catch {
      toast.error('Erro ao carregar combos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCombos(); }, []);

  const generateCombos = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-insights/combos', { method: 'POST' });
      const data = await res.json();
      if (data.generated > 0) {
        toast.success(`${data.generated} combos gerados com sucesso!`);
        fetchCombos();
      } else {
        toast.error(data.error || 'Não foi possível gerar combos');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setGenerating(false);
    }
  };

  const togglePin = async (id: string) => {
    try {
      const res = await fetch(`/api/ai-insights/combos/${id}/toggle-pin`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCombos(prev => prev.map(c => c.id === id ? { ...c, pinned: data.pinned } : c));
        toast.success(data.pinned ? 'Combo ativado no cardápio digital!' : 'Combo removido do cardápio digital');
      }
    } catch {
      toast.error('Erro');
    }
  };

  const dismissCombo = async (id: string) => {
    try {
      await fetch(`/api/ai-insights/${id}/dismiss`, { method: 'POST' });
      setCombos(prev => prev.filter(c => c.id !== id));
      toast.success('Combo descartado');
    } catch {
      toast.error('Erro');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-primary" />
              Combos Inteligentes
            </h1>
            <p className="text-muted-foreground text-sm">
              Sugestões de combo baseadas em engenharia de cardápio e padrões de pedido
            </p>
          </div>
        </div>
        <Button onClick={generateCombos} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Gerar Combos com IA
        </Button>
      </div>

      {/* Info card */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">Como funciona</p>
            <p className="text-blue-700 dark:text-blue-300 mt-1">
              A IA analisa a classificação de engenharia de cardápio (Estrela, Enigma, etc.) e os padrões de pedidos
              recentes para sugerir combos que maximizam seu lucro. Combos com <strong>pin ativado</strong> aparecem
              no cardápio digital público.
            </p>
          </div>
        </div>
      </Card>

      {combos.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nenhum combo gerado ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em “Gerar Combos com IA” para começar</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {combos.map((combo) => (
            <Card key={combo.id} className={`p-5 transition-all ${
              combo.pinned ? 'ring-2 ring-primary/50 bg-primary/5' : ''
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{combo.title}</h3>
                    {combo.pinned && (
                      <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Eye className="w-3 h-3" /> No cardápio
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{combo.summary}</p>
                  {combo.content && combo.content !== combo.summary && (
                    <p className="text-xs text-muted-foreground/80 mt-1 italic">
                      🎯 Estratégia: {combo.content}
                    </p>
                  )}

                  {/* Items */}
                  {combo.dataSnapshot?.items && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {combo.dataSnapshot.items.map((item, i) => (
                        <span key={i} className="text-xs bg-muted px-3 py-1 rounded-full">
                          {item.name} — R$ {Number(item.price).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Pricing */}
                  <div className="flex items-center gap-3 mt-3">
                    {combo.dataSnapshot?.originalPrice > 0 && (
                      <span className="text-sm text-muted-foreground line-through">
                        R$ {Number(combo.dataSnapshot.originalPrice).toFixed(2)}
                      </span>
                    )}
                    {combo.dataSnapshot?.comboPrice > 0 && (
                      <span className="text-lg font-bold text-primary">
                        R$ {Number(combo.dataSnapshot.comboPrice).toFixed(2)}
                      </span>
                    )}
                    {combo.dataSnapshot?.discountPercent > 0 && (
                      <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        -{combo.dataSnapshot.discountPercent}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    variant={combo.pinned ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => togglePin(combo.id)}
                    title={combo.pinned ? 'Remover do cardápio' : 'Mostrar no cardápio'}
                  >
                    {combo.pinned ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissCombo(combo.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Descartar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
