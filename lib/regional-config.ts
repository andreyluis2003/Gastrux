// @ts-nocheck
/**
 * FASE 10: Regional Configuration
 * Manages timezone, locale, and currency settings for LATAM regions
 */

export type RegionCode = 'BR' | 'AR' | 'CL' | 'CO' | 'PE' | 'MX';

export interface RegionalConfig {
  code: RegionCode;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  decimalSeparator: string;
  thousandsSeparator: string;
  complianceRequirements: string[];
}

/**
 * Regional configurations for LATAM
 */
export const REGIONAL_CONFIGS: Record<RegionCode, RegionalConfig> = {
  BR: {
    code: 'BR',
    name: 'Brasil',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    complianceRequirements: ['LGPD', 'Data residency Brazil'],
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    timezone: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
    currency: 'ARS',
    currencySymbol: '$',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    complianceRequirements: ['PDPA', 'Data protection'],
  },
  CL: {
    code: 'CL',
    name: 'Chile',
    timezone: 'America/Santiago',
    locale: 'es-CL',
    currency: 'CLP',
    currencySymbol: '$',
    dateFormat: 'DD-MM-YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    complianceRequirements: ['LGPD', 'Right to deletion'],
  },
  CO: {
    code: 'CO',
    name: 'Colômbia',
    timezone: 'America/Bogota',
    locale: 'es-CO',
    currency: 'COP',
    currencySymbol: '$',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    complianceRequirements: ['Data protection law'],
  },
  PE: {
    code: 'PE',
    name: 'Peru',
    timezone: 'America/Lima',
    locale: 'es-PE',
    currency: 'PEN',
    currencySymbol: 'S/',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    complianceRequirements: ['Data protection'],
  },
  MX: {
    code: 'MX',
    name: 'México',
    timezone: 'America/Mexico_City',
    locale: 'es-MX',
    currency: 'MXN',
    currencySymbol: '$',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    complianceRequirements: ['Data protection'],
  },
};

/**
 * Get regional config by code
 */
export function getRegionalConfig(code: RegionCode | string): RegionalConfig {
  return REGIONAL_CONFIGS[code as RegionCode] || REGIONAL_CONFIGS.BR;
}

/**
 * Detect region from country code (from geolocation)
 */
export function detectRegionFromCountry(countryCode: string): RegionCode {
  const codeMap: Record<string, RegionCode> = {
    BR: 'BR',
    AR: 'AR',
    CL: 'CL',
    CO: 'CO',
    PE: 'PE',
    MX: 'MX',
  };
  return codeMap[countryCode.toUpperCase()] || 'BR';
}

/**
 * Format number according to regional rules
 */
export function formatNumberByRegion(
  value: number,
  region: RegionCode = 'BR',
  decimals: number = 2,
): string {
  const config = getRegionalConfig(region);
  const formatted = value.toFixed(decimals);
  const [intPart, decPart] = formatted.split('.');

  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  return decPart !== undefined
    ? `${intFormatted}${config.decimalSeparator}${decPart}`
    : intFormatted;
}

/**
 * Format currency according to regional rules
 */
export function formatCurrencyByRegion(
  value: number,
  region: RegionCode = 'BR',
): string {
  const config = getRegionalConfig(region);
  const formatted = formatNumberByRegion(value, region, 2);
  return `${config.currencySymbol} ${formatted}`;
}

/**
 * Format date according to regional rules
 */
export function formatDateByRegion(
  date: Date,
  region: RegionCode = 'BR',
): string {
  const config = getRegionalConfig(region);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  switch (config.dateFormat) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

/**
 * Get all supported regions
 */
export function getSupportedRegions(): RegionalConfig[] {
  return Object.values(REGIONAL_CONFIGS);
}
