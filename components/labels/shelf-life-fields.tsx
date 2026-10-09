'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ShelfLifeForm {
  shelfLifeAmbientDays: string;
  shelfLifeChilledDays: string;
  shelfLifeFrozenDays: string;
}

/** A form's state for the three fields: null (not applicable) becomes an empty box */
export const shelfLifeToForm = (item: { shelfLifeAmbientDays?: number | null; shelfLifeChilledDays?: number | null; shelfLifeFrozenDays?: number | null }): ShelfLifeForm => ({
  shelfLifeAmbientDays: item.shelfLifeAmbientDays === null || item.shelfLifeAmbientDays === undefined ? '' : String(item.shelfLifeAmbientDays),
  shelfLifeChilledDays: item.shelfLifeChilledDays === null || item.shelfLifeChilledDays === undefined ? '' : String(item.shelfLifeChilledDays),
  shelfLifeFrozenDays: item.shelfLifeFrozenDays === null || item.shelfLifeFrozenDays === undefined ? '' : String(item.shelfLifeFrozenDays),
});

const FIELDS = [
  ['shelfLifeAmbientDays', 'Ambiente'],
  ['shelfLifeChilledDays', 'Refrigerado'],
  ['shelfLifeFrozenDays', 'Congelado'],
] as const;

/**
 * Days a food label of this item is valid per storage (spec 2026-10-09 etiquetas, 5.5). The API
 * parses them (lib/labels/rules.ts shelfLifeFromBody): empty = not applicable, 0 = consumir no dia.
 */
export function ShelfLifeFields({ value, onChange }: { value: ShelfLifeForm; onChange: (next: ShelfLifeForm) => void }) {
  return (
    <div className="space-y-2">
      <Label>Validade da etiqueta (dias)</Label>
      <p className="text-xs text-muted-foreground">Vazio = não se aplica. 0 = consumir no dia.</p>
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map(([field, label]) => (
          <div key={field}>
            <Label htmlFor={field} className="text-xs">{label}</Label>
            <Input
              id={field}
              type="number"
              min={0}
              max={365}
              step={1}
              inputMode="numeric"
              value={value[field]}
              onChange={(e) => onChange({ ...value, [field]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
