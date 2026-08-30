'use client';

import { useState } from 'react';
import { Save, Trash2, Check } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface FilterPreset {
  name: string;
  filters: Record<string, any>;
  createdAt: string;
}

interface FilterPresetManagerProps {
  currentFilters: Record<string, any>;
  onLoadPreset: (filters: Record<string, any>) => void;
  className?: string;
}

export function FilterPresetManager({
  currentFilters,
  onLoadPreset,
  className,
}: FilterPresetManagerProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const savePreset = () => {
    if (!presetName.trim()) return;
    const newPreset: FilterPreset = {
      name: presetName,
      filters: currentFilters,
      createdAt: new Date().toISOString(),
    };
    setPresets([...presets, newPreset]);
    setPresetName('');
    setShowSaveDialog(false);
  };

  const deletePreset = (index: number) => {
    setPresets(presets.filter((_, i) => i !== index));
  };

  const loadPreset = (preset: FilterPreset) => {
    onLoadPreset(preset.filters);
    setShowPresets(false);
  };

  const hasFilters = Object.keys(currentFilters).length > 0;

  return (
    <div className={cn('relative', className)}>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSaveDialog(!showSaveDialog)}
          disabled={!hasFilters}
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          Salvar Filtro
        </Button>
        {presets.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2"
          >
            Meus Filtros ({presets.length})
          </Button>
        )}
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nome do filtro"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={savePreset} disabled={!presetName.trim()}>
                <Check className="h-4 w-4 mr-2" />
                Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Presets List */}
      {showPresets && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="max-h-96 overflow-y-auto">
            {presets.map((preset, index) => (
              <div
                key={index}
                className="border-b border-slate-100 p-3 last:border-b-0 dark:border-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => loadPreset(preset)}
                    className="flex-1 text-left hover:text-primary"
                  >
                    <p className="font-medium text-slate-900 dark:text-slate-100">{preset.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {Object.keys(preset.filters).length} filtro(s)
                    </p>
                  </button>
                  <button
                    onClick={() => deletePreset(index)}
                    className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
