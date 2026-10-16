'use client';

/** "Contar na contagem do dia" (spec 2026-10-16 contagem de espetos, 4.1) */
export function DailyCountField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">Contar na contagem do dia</span>
        <span className="block text-sm text-muted-foreground">
          Para o que é preparado antes de vender (espetos, salgados): montados, vendidos, perdas e o que sobrou em cada noite.
        </span>
      </span>
    </label>
  );
}
