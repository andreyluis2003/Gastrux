/**
 * Who the Gastrux invoice (NFS-e) is made out to (2026-11-01). The accountant lists CPF/CNPJ, address,
 * service and value as required, so the owner fills this in before subscribing. No Prisma here: the
 * form imports this file. The CNPJ can have letters since July 2026 (only the check digits are numbers).
 */
export interface BillingProfileData {
  document: string;
  name: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export const cleanDocument = (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, '');

export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (size: number) => {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const digit = (size: number) => {
    let sum = 0;
    let weight = 2;
    for (let i = size - 1; i >= 0; i--) {
      sum += (cnpj.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function formatDocument(document: string): string {
  if (document.length === 11) return document.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4');
  return document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}

const text = (raw: unknown, max: number) => (typeof raw === 'string' ? raw.trim().slice(0, max) : '');

type Result = { ok: true; value: BillingProfileData } | { ok: false; error: string };

export function parseBillingProfile(raw: any): Result {
  const document = cleanDocument(text(raw?.document, 30));
  if (!(document.length === 11 ? isValidCpf(document) : isValidCnpj(document))) {
    return { ok: false, error: 'CPF ou CNPJ inválido. Confira os números.' };
  }
  const name = text(raw?.name, 150);
  if (name.length < 3) return { ok: false, error: 'Informe o nome ou a razão social.' };
  const zipCode = text(raw?.zipCode, 12).replace(/\D/g, '');
  if (zipCode.length !== 8) return { ok: false, error: 'Informe o CEP com 8 números.' };
  const street = text(raw?.street, 150);
  const number = text(raw?.number, 20);
  const neighborhood = text(raw?.neighborhood, 100);
  const city = text(raw?.city, 100);
  const state = text(raw?.state, 2).toUpperCase();
  if (!street || !number || !neighborhood || !city) return { ok: false, error: 'Preencha rua, número, bairro e cidade.' };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: 'Informe a UF com 2 letras.' };
  return { ok: true, value: { document, name, zipCode, street, number, complement: text(raw?.complement, 100) || null, neighborhood, city, state } };
}
