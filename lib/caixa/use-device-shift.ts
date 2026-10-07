'use client';

import { useCallback, useEffect, useState } from 'react';
import { pickRegister, readRemembered, remember, type RegisterOption } from './device-register';

/** The register this device uses and its open shift, for the payment panel (spec §8.3). */
export function useDeviceShift() {
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState<RegisterOption | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftOpenedAt, setShiftOpenedAt] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/caixa/registers');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const reg = pickRegister(data.registers, readRemembered());
      setRegister(reg);
      if (reg) remember(reg.id);
      const listed = data.registers.find((r: any) => r.id === reg?.id);
      setShiftId(listed?.openSession?.id ?? null);
      setShiftOpenedAt(listed?.openSession?.openedAt ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { loading, register, shiftId, shiftOpenedAt, refresh };
}
