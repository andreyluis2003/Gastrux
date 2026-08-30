'use client';

import { useState } from 'react';
import { Copy, RotateCcw, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useThemeCustomizer } from '@/hooks/use-theme-customizer';
import { ThemeColors } from '@/lib/theme-manager';

const COLOR_KEYS: Array<keyof ThemeColors> = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'error',
  'info',
  'background',
  'card',
  'muted',
  'border',
];

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  primary: 'Primária',
  secondary: 'Secundária',
  accent: 'Destaque',
  success: 'Sucesso',
  warning: 'Aviso',
  error: 'Erro',
  info: 'Informação',
  background: 'Fundo',
  card: 'Card',
  muted: 'Silenciada',
  border: 'Borda',
};

export function ThemeCustomizer() {
  const {
    mounted,
    theme,
    currentPreset,
    customColors,
    presets,
    applyPreset,
    updateColor,
    resetToPreset,
    toggleDarkMode,
    getCurrentColors,
  } = useThemeCustomizer();

  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  if (!mounted) return null;

  const currentColors = getCurrentColors();
  const isCustom = customColors !== null;

  const copyToClipboard = (color: string) => {
    navigator.clipboard.writeText(color);
    setCopiedColor(color);
    setTimeout(() => setCopiedColor(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            Modo de Tema
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {theme === 'dark' ? 'Modo Escuro Ativo' : 'Modo Claro Ativo'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDarkMode}
          className="gap-2"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4" />
              Claro
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              Escuro
            </>
          )}
        </Button>
      </div>

      {/* Preset Selection */}
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Temas Predefinidos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                currentPreset === preset.id && !isCustom
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {preset.name}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {preset.description}
              </p>
              {/* Color preview dots */}
              <div className="flex gap-1.5 mt-2">
                {['primary', 'secondary', 'accent'].map((key) => (
                  <div
                    key={key}
                    className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-600"
                    style={{
                      backgroundColor: preset.colors[key as keyof typeof preset.colors],
                    }}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Colors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            Personalizar Cores
          </h3>
          {isCustom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToPreset}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Resetar
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COLOR_KEYS.map((key) => (
            <Card key={key} className="p-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                {COLOR_LABELS[key]}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={currentColors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-200 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    value={currentColors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 flex-1"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(currentColors[key])}
                  className="px-2"
                  title="Copiar cor"
                >
                  {copiedColor === currentColors[key] ? (
                    <span className="text-xs text-green-600">✓</span>
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Color Palette Preview */}
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Prévia da Paleta
        </h3>
        <Card className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COLOR_KEYS.map((key) => (
              <div key={key} className="text-center">
                <div
                  className="w-full h-24 rounded-lg mb-2 border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: currentColors[key] }}
                  onClick={() => copyToClipboard(currentColors[key])}
                  title="Clique para copiar"
                />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                  {COLOR_LABELS[key]}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 font-mono">
                  {currentColors[key]}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Info */}
      <Card className="p-3 bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          💡 As alterações de cor são salvas automaticamente e persistem entre visitas.
        </p>
      </Card>
    </div>
  );
}
