'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { CalendarDays, Loader2, Save, Eye, EyeOff, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface SeasonalItem {
  id: string;
  name: string;
  categoryName: string;
  available: boolean;
  displayOnWeb: boolean;
  price: number;
}

interface Schedule {
  dayOfWeek: number;
  enabledItems: string[];
  disabledItems: string[];
}

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function CardapioSazonalPage() {
  const [items, setItems] = useState<SeasonalItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>(
    Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, enabledItems: [], disabledItems: [] }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/cardapio/sazonal');
        if (res.ok) {
          const data = await res.json();
          // API returns { categories: [{ items: [...] }] } — flatten to items[]
          let flatItems: SeasonalItem[] = [];
          if (data.items) {
            flatItems = data.items;
          } else if (data.categories) {
            flatItems = (data.categories || []).flatMap((cat: any) =>
              (cat.items || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                categoryName: cat.name || '',
                available: item.available ?? true,
                displayOnWeb: item.displayOnWeb ?? true,
                price: typeof item.price === 'object' ? Number(item.price) : (item.price || 0),
              }))
            );
          }
          setItems(flatItems);
          if (data.schedules?.length) setSchedules(data.schedules);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  function toggleItem(itemId: string) {
    setSchedules(prev => prev.map(s => {
      if (s.dayOfWeek !== selectedDay) return s;
      const isEnabled = s.enabledItems.includes(itemId);
      const isDisabled = s.disabledItems.includes(itemId);
      // Cycle: Normal -> Desativado -> Ativado(destaque) -> Normal
      if (isEnabled) {
        return { ...s, enabledItems: s.enabledItems.filter(id => id !== itemId) };
      } else if (isDisabled) {
        return { ...s, disabledItems: s.disabledItems.filter(id => id !== itemId), enabledItems: [...s.enabledItems, itemId] };
      } else {
        return { ...s, disabledItems: [...s.disabledItems, itemId] };
      }
    }));
  }

  function getItemStatus(itemId: string): 'normal' | 'enabled' | 'disabled' {
    const sched = schedules.find(s => s.dayOfWeek === selectedDay);
    if (sched?.enabledItems.includes(itemId)) return 'enabled';
    if (sched?.disabledItems.includes(itemId)) return 'disabled';
    return 'normal';
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/cardapio/sazonal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedules }) });
      if (res.ok) toast.success('Programação salva!');
      else toast.error('Erro ao salvar');
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-6 w-6 text-teal-600" /> Cardápio Sazonal</h1>
          <p className="text-sm text-gray-500">Programação de cardápio por dia da semana</p>
        </div>
      </div>

      <Card className="p-4 bg-teal-50 border-teal-200">
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 text-teal-600 mt-0.5" />
          <div>
            <p className="text-sm text-teal-800 font-medium">Como funciona</p>
            <p className="text-xs text-teal-700 mt-1">Clique em cada item para alternar: <span className="font-medium">Normal</span> (segue padrão) → <span className="font-medium text-red-600">Desativado</span> (oculto neste dia) → <span className="font-medium text-green-600">Ativado</span> (destaque especial).</p>
          </div>
        </div>
      </Card>

      {/* Day selector */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {dayNames.map((name, i) => (
          <button key={i} onClick={() => setSelectedDay(i)}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${selectedDay === i ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">Nenhum item no cardápio. Cadastre itens primeiro.</Card>
      ) : (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">Itens para {dayNames[selectedDay]}</h2>
            <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </div>
          <div className="space-y-1">
            {items.map(item => {
              const status = getItemStatus(item.id);
              return (
                <button key={item.id} onClick={() => toggleItem(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors
                    ${status === 'disabled' ? 'bg-red-50 border border-red-200' : status === 'enabled' ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    {status === 'disabled' ? <EyeOff className="h-4 w-4 text-red-500" /> : status === 'enabled' ? <Eye className="h-4 w-4 text-green-500" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    <div>
                      <p className={`text-sm font-medium ${status === 'disabled' ? 'text-red-700 line-through' : ''}`}>{item.name}</p>
                      <p className="text-xs text-gray-500">{item.categoryName}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${status === 'disabled' ? 'bg-red-200 text-red-800' : status === 'enabled' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                    {status === 'disabled' ? 'Desativado' : status === 'enabled' ? 'Destaque' : 'Normal'}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
