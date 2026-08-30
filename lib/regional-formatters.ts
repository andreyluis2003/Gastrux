// @ts-nocheck
/**
 * Regional Data Formatting - Phase 10.2
 * LATAM-specific formatting for currency, dates, numbers
 */

/**
 * Supported LATAM Regions
 */
export type LatamRegion = 'BR' | 'AR' | 'CL' | 'CO' | 'PE' | 'MX';

/**
 * Regional Configuration
 */
interface RegionalConfig {
  region: LatamRegion;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  decimalSeparator: ',' | '.';
  thousandsSeparator: '.' | ',';
  taxRate: number;
}

const REGIONAL_CONFIGS: Record<LatamRegion, RegionalConfig> = {
  BR: {
    region: 'BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    taxRate: 0.07 // IPI/ICMS average
  },
  AR: {
    region: 'AR',
    currency: 'ARS',
    currencySymbol: '$',
    locale: 'es-AR',
    timezone: 'America/Argentina/Buenos_Aires',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    taxRate: 0.105 // IVA
  },
  CL: {
    region: 'CL',
    currency: 'CLP',
    currencySymbol: '$',
    locale: 'es-CL',
    timezone: 'America/Santiago',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    taxRate: 0.19 // IVA
  },
  CO: {
    region: 'CO',
    currency: 'COP',
    currencySymbol: '$',
    locale: 'es-CO',
    timezone: 'America/Bogota',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    thousandsSeparator: '.',
    taxRate: 0.08 // IVA
  },
  PE: {
    region: 'PE',
    currency: 'PEN',
    currencySymbol: 'S/',
    locale: 'es-PE',
    timezone: 'America/Lima',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    taxRate: 0.18 // IGV
  },
  MX: {
    region: 'MX',
    currency: 'MXN',
    currencySymbol: '$',
    locale: 'es-MX',
    timezone: 'America/Mexico_City',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    taxRate: 0.16 // IVA
  }
};

/**
 * Get regional configuration
 */
export function getRegionalConfig(region: LatamRegion | string = 'BR'): RegionalConfig {
  return REGIONAL_CONFIGS[(region as LatamRegion) || 'BR'] || REGIONAL_CONFIGS.BR;
}

/**
 * Format currency by region
 */
export function formatCurrency(
  value: number | null | undefined,
  region: LatamRegion | string = 'BR'
): string {
  if (value === null || value === undefined) return '-';

  const config = getRegionalConfig(region);
  
  const formatter = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return formatter.format(value);
}

/**
 * Format number with regional separators
 */
export function formatNumber(
  value: number | null | undefined,
  region: LatamRegion | string = 'BR',
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '-';

  const config = getRegionalConfig(region);
  
  const formatter = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return formatter.format(value);
}

/**
 * Format date by region
 */
export function formatDate(
  date: Date | null | undefined,
  region: LatamRegion | string = 'BR'
): string {
  if (!date) return '-';

  const config = getRegionalConfig(region);
  const d = new Date(date);

  if (config.dateFormat === 'DD/MM/YYYY') {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } else {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  }
}

/**
 * Format date and time
 */
export function formatDateTime(
  date: Date | null | undefined,
  region: LatamRegion | string = 'BR'
): string {
  if (!date) return '-';

  const config = getRegionalConfig(region);
  const d = new Date(date);

  const dateStr = formatDate(d, region);
  const timeStr = d.toLocaleTimeString(config.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${dateStr} ${timeStr}`;
}

/**
 * Format percentage
 */
export function formatPercentage(
  value: number | null | undefined,
  region: LatamRegion | string = 'BR',
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '-';

  const config = getRegionalConfig(region);
  const formatted = formatNumber(value, region, decimals);

  return `${formatted}%`;
}

/**
 * Calculate with tax by region
 */
export function applyRegionalTax(
  value: number,
  region: LatamRegion | string = 'BR'
): number {
  const config = getRegionalConfig(region);
  return value * (1 + config.taxRate);
}

/**
 * Remove tax from price
 */
export function removeRegionalTax(
  value: number,
  region: LatamRegion | string = 'BR'
): number {
  const config = getRegionalConfig(region);
  return value / (1 + config.taxRate);
}

/**
 * Convert between currencies
 * Note: This is simplified - use real exchange rates in production
 */
export function convertCurrency(
  value: number,
  fromRegion: LatamRegion | string,
  toRegion: LatamRegion | string,
  exchangeRates: Record<string, number> = {}
): number {
  if (fromRegion === toRegion) return value;

  // In production, fetch real exchange rates from API
  // This is a placeholder
  return value;
}

/**
 * Get regional name
 */
export function getRegionName(region: LatamRegion | string): string {
  const names: Record<string, string> = {
    BR: 'Brasil',
    AR: 'Argentina',
    CL: 'Chile',
    CO: 'Colombia',
    PE: 'Peru',
    MX: 'Mexico'
  };
  return names[region] || 'Unknown';
}

/**
 * Get all supported regions
 */
export function getSupportedRegions(): LatamRegion[] {
  return Object.keys(REGIONAL_CONFIGS) as LatamRegion[];
}
