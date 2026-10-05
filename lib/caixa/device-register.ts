/** Which cash register this device uses (spec §8.1). Stored per device; any failure falls back to the default. */
export const DEVICE_REGISTER_KEY = 'gastrux:caixa:register';

export interface RegisterOption { id: string; name: string; isDefault: boolean }

export function pickRegister(registers: RegisterOption[], remembered: string | null): RegisterOption | null {
  if (!registers.length) return null;
  return registers.find((r) => r.id === remembered) ?? registers.find((r) => r.isDefault) ?? registers[0];
}

export function readRemembered(): string | null {
  try { return window.localStorage.getItem(DEVICE_REGISTER_KEY); } catch { return null; }
}

export function remember(id: string) {
  try { window.localStorage.setItem(DEVICE_REGISTER_KEY, id); } catch { /* private window: the default is used */ }
}
