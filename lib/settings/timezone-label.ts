/** How people name the Brazilian time zones of Configurações > Fuso horário (the select showed "Sao_Paulo", 2026-10-25) */
const LABELS: Record<string, string> = {
  'America/Sao_Paulo': 'Brasília (São Paulo)',
  'America/Bahia': 'Bahia',
  'America/Belem': 'Belém',
  'America/Manaus': 'Manaus',
  'America/Cuiaba': 'Cuiabá',
  'America/Fortaleza': 'Fortaleza',
  'America/Recife': 'Recife',
  'America/Porto_Velho': 'Porto Velho',
  'America/Rio_Branco': 'Rio Branco',
  'America/Araguaina': 'Araguaína',
  'America/Noronha': 'Fernando de Noronha',
};

export const timezoneLabel = (tz: string) => LABELS[tz] ?? tz.replace('America/', '').replace(/_/g, ' ');
