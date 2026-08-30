'use client';

import { useState, ReactNode } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterOption {
  label: string;
  value: string | number | boolean;
}

interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'range' | 'checkbox';
  options?: FilterOption[];
  minValue?: number;
  maxValue?: number;
  step?: number;
}

interface AdvancedFilterProps {
  filters: FilterField[];
  onFilterChange: (filters: Record<string, any>) => void;
  onReset?: () => void;
  className?: string;
  children?: ReactNode;
}

interface AppliedFilter {
  key: string;
  label: string;
  value: string | number | boolean | (string | number | boolean)[];
  displayValue: string;
}

export function AdvancedFilter({
  filters,
  onFilterChange,
  onReset,
  className,
  children,
}: AdvancedFilterProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...activeFilters };
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    setActiveFilters(newFilters);
    updateAppliedFilters(newFilters);
    onFilterChange(newFilters);
  };

  const updateAppliedFilters = (filterData: Record<string, any>) => {
    const applied: AppliedFilter[] = [];
    Object.entries(filterData).forEach(([key, value]) => {
      const filterDef = filters.find((f) => f.key === key);
      if (filterDef) {
        let displayValue = '';
        if (Array.isArray(value)) {
          displayValue = value
            .map((v) => filterDef.options?.find((o) => o.value === v)?.label || v)
            .join(', ');
        } else if (filterDef.type === 'range') {
          displayValue = `${value[0]} - ${value[1]}`;
        } else {
          displayValue = filterDef.options?.find((o) => o.value === value)?.label || String(value);
        }
        applied.push({
          key,
          label: filterDef.label,
          value,
          displayValue,
        });
      }
    });
    setAppliedFilters(applied);
  };

  const removeFilter = (key: string) => {
    handleFilterChange(key, null);
  };

  const handleReset = () => {
    setActiveFilters({});
    setAppliedFilters([]);
    onReset?.();
    onFilterChange({});
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Triggers */}
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <div key={filter.key} className="relative">
            <button
              onClick={() => setExpandedFilter(expandedFilter === filter.key ? null : filter.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                activeFilters[filter.key]
                  ? 'border-primary bg-primary/10 text-primary dark:border-primary/50 dark:bg-primary/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              )}
            >
              {filter.label}
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', {
                  'rotate-180': expandedFilter === filter.key,
                })}
              />
            </button>

            {/* Filter Dropdown */}
            {expandedFilter === filter.key && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {filter.type === 'select' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleFilterChange(filter.key, null)}
                      className="w-full rounded px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      Nenhum filtro
                    </button>
                    {filter.options?.map((option) => (
                      <button
                        key={String(option.value)}
                        onClick={() => handleFilterChange(filter.key, option.value)}
                        className={cn(
                          'w-full rounded px-2 py-1 text-left text-sm transition-colors',
                          activeFilters[filter.key] === option.value
                            ? 'bg-primary/20 font-medium text-primary dark:bg-primary/30'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {filter.type === 'multiselect' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleFilterChange(filter.key, [])}
                      className="w-full rounded px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-700"
                    >
                      Limpar seleção
                    </button>
                    {filter.options?.map((option) => (
                      <label key={String(option.value)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input
                          type="checkbox"
                          checked={(activeFilters[filter.key] || []).includes(option.value)}
                          onChange={(e) => {
                            const current = activeFilters[filter.key] || [];
                            const updated = e.target.checked
                              ? [...current, option.value]
                              : current.filter((v: any) => v !== option.value);
                            handleFilterChange(filter.key, updated);
                          }}
                          className="h-4 w-4 rounded border-slate-300 accent-primary"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {filter.type === 'range' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Mín: {activeFilters[filter.key]?.[0] ?? filter.minValue}
                      </label>
                      <input
                        type="range"
                        min={filter.minValue}
                        max={filter.maxValue}
                        step={filter.step || 1}
                        value={activeFilters[filter.key]?.[0] ?? filter.minValue}
                        onChange={(e) => {
                          const max = activeFilters[filter.key]?.[1] ?? filter.maxValue;
                          handleFilterChange(filter.key, [Number(e.target.value), max]);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Máx: {activeFilters[filter.key]?.[1] ?? filter.maxValue}
                      </label>
                      <input
                        type="range"
                        min={filter.minValue}
                        max={filter.maxValue}
                        step={filter.step || 1}
                        value={activeFilters[filter.key]?.[1] ?? filter.maxValue}
                        onChange={(e) => {
                          const min = activeFilters[filter.key]?.[0] ?? filter.minValue;
                          handleFilterChange(filter.key, [min, Number(e.target.value)]);
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                {filter.type === 'checkbox' && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeFilters[filter.key] || false}
                      onChange={(e) => handleFilterChange(filter.key, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-primary"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{filter.label}</span>
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Applied Filters Display */}
      {appliedFilters.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {appliedFilters.map((filter) => (
              <div
                key={filter.key}
                className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary dark:bg-primary/25 dark:text-primary/80"
              >
                <span className="font-medium">{filter.label}:</span>
                <span>{filter.displayValue}</span>
                <button
                  onClick={() => removeFilter(filter.key)}
                  className="ml-1 rounded-full hover:bg-primary/20 dark:hover:bg-primary/30"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Limpar todos os filtros
          </button>
        </div>
      )}

      {children}
    </div>
  );
}