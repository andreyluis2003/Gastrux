// @ts-nocheck
'use client';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  card: string;
  muted: string;
  border: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  darkMode?: ThemeColors;
}

// Predefined color themes
export const THEME_PRESETS: Record<string, ThemePreset> = {
  modern: {
    id: 'modern',
    name: 'Modern Blue',
    description: 'Vibrant and trustworthy professional theme',
    colors: {
      primary: '#3B82F6',        // Blue
      secondary: '#F59E0B',      // Amber
      accent: '#7C3AED',         // Violet
      success: '#10B981',        // Emerald
      warning: '#F59E0B',        // Amber
      error: '#EF4444',          // Red
      info: '#3B82F6',           // Blue
      background: '#FFFFFF',     // White
      card: '#FFFFFF',           // White
      muted: '#F3F4F6',          // Light Gray
      border: '#E5E7EB',         // Gray
    },
    darkMode: {
      primary: '#60A5FA',        // Light Blue
      secondary: '#FBBF24',      // Light Amber
      accent: '#A78BFA',         // Light Violet
      success: '#34D399',        // Light Emerald
      warning: '#FBBF24',        // Light Amber
      error: '#F87171',          // Light Red
      info: '#60A5FA',           // Light Blue
      background: '#0F172A',     // Dark Navy
      card: '#1E293B',           // Dark Gray
      muted: '#334155',          // Medium Gray
      border: '#475569',         // Gray
    },
  },
  restaurant: {
    id: 'restaurant',
    name: 'Restaurant Premium',
    description: 'Warm, inviting theme perfect for restaurants',
    colors: {
      primary: '#DC2626',        // Restaurant Red
      secondary: '#F59E0B',      // Gold Amber
      accent: '#D97706',         // Orange
      success: '#059669',        // Emerald
      warning: '#F59E0B',        // Amber
      error: '#991B1B',          // Dark Red
      info: '#3B82F6',           // Blue
      background: '#FFFBF0',     // Warm White
      card: '#FFFFFF',           // White
      muted: '#FEF3C7',          // Warm Muted
      border: '#FDE68A',         // Light Amber
    },
    darkMode: {
      primary: '#FCA5A5',        // Light Red
      secondary: '#FCD34D',      // Light Gold
      accent: '#FB923C',         // Light Orange
      success: '#6EE7B7',        // Light Emerald
      warning: '#FCD34D',        // Light Amber
      error: '#FE8B8B',          // Light Red
      info: '#60A5FA',           // Light Blue
      background: '#2D1F1A',     // Dark Brown
      card: '#3D2922',           // Medium Brown
      muted: '#5A4A44',          // Medium Gray Brown
      border: '#8B7355',         // Tan
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool, fresh ocean-inspired theme',
    colors: {
      primary: '#0369A1',        // Ocean Blue
      secondary: '#00D9FF',      // Cyan
      accent: '#06B6D4',         // Teal
      success: '#14B8A6',        // Teal Green
      warning: '#EAB308',        // Yellow
      error: '#EF4444',          // Red
      info: '#0369A1',           // Ocean Blue
      background: '#F0F9FF',     // Light Blue
      card: '#FFFFFF',           // White
      muted: '#CFFAFE',          // Very Light Cyan
      border: '#A5F3FC',         // Light Cyan
    },
    darkMode: {
      primary: '#38BDF8',        // Light Blue
      secondary: '#22D3EE',      // Light Cyan
      accent: '#20C997',         // Light Teal
      success: '#2DD4BF',        // Light Teal Green
      warning: '#FACC15',        // Light Yellow
      error: '#F87171',          // Light Red
      info: '#38BDF8',           // Light Blue
      background: '#0C2340',     // Very Dark Blue
      card: '#164E63',           // Dark Teal
      muted: '#0F766E',          // Medium Teal
      border: '#155E75',         // Dark Cyan
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm sunset-inspired vibrant theme',
    colors: {
      primary: '#EA580C',        // Orange
      secondary: '#EC4899',      // Pink
      accent: '#F43F5E',         // Rose
      success: '#22C55E',        // Green
      warning: '#FBBF24',        // Amber
      error: '#DC2626',          // Red
      info: '#3B82F6',           // Blue
      background: '#FFF7ED',     // Warm White
      card: '#FFFFFF',           // White
      muted: '#FED7AA',          // Light Orange
      border: '#FDBA74',         // Warm Gray
    },
    darkMode: {
      primary: '#FB923C',        // Light Orange
      secondary: '#F472B6',      // Light Pink
      accent: '#FB7185',         // Light Rose
      success: '#4ADE80',        // Light Green
      warning: '#FBBF24',        // Light Amber
      error: '#F87171',          // Light Red
      info: '#60A5FA',           // Light Blue
      background: '#431407',     // Very Dark Orange
      card: '#7C2D12',           // Dark Orange
      muted: '#B45309',          // Medium Orange
      border: '#D97706',         // Orange
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Natural, calming green theme',
    colors: {
      primary: '#047857',        // Emerald Green
      secondary: '#65A30D',      // Lime
      accent: '#16A34A',         // Green
      success: '#059669',        // Emerald
      warning: '#F59E0B',        // Amber
      error: '#DC2626',          // Red
      info: '#0891B2',           // Cyan
      background: '#F0FDF4',     // Light Green
      card: '#FFFFFF',           // White
      muted: '#DCFCE7',          // Very Light Green
      border: '#BBF7D0',         // Light Green
    },
    darkMode: {
      primary: '#10B981',        // Light Emerald
      secondary: '#84CC16',      // Light Lime
      accent: '#4ADE80',         // Light Green
      success: '#6EE7B7',        // Light Emerald
      warning: '#FBBF24',        // Light Amber
      error: '#F87171',          // Light Red
      info: '#22D3EE',           // Light Cyan
      background: '#051E1A',     // Very Dark Green
      card: '#14532D',           // Dark Green
      muted: '#166534',          // Medium Green
      border: '#059669',         // Emerald
    },
  },
};

/**
 * Apply theme colors to CSS variables
 */
export function applyThemeColors(colors: ThemeColors, isDark: boolean = false) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const prefix = isDark ? '--' : '--';

  // Convert hex to HSL for CSS variables
  Object.entries(colors).forEach(([key, value]) => {
    const hslValue = hexToHsl(value);
    root.style.setProperty(`${prefix}${key}`, hslValue);
  });
}

/**
 * Convert hex color to HSL string for CSS variables
 */
export function hexToHsl(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Get contrast color for a given hex color
 */
export function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

/**
 * Save theme preference to localStorage
 */
export function saveThemePreference(themeId: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme-preference', themeId);
  }
}

/**
 * Load theme preference from localStorage
 */
export function loadThemePreference(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('theme-preference');
  }
  return null;
}

/**
 * Save custom color theme
 */
export function saveCustomTheme(colors: ThemeColors) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('custom-theme', JSON.stringify(colors));
  }
}

/**
 * Load custom color theme
 */
export function loadCustomTheme(): ThemeColors | null {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('custom-theme');
    return saved ? JSON.parse(saved) : null;
  }
  return null;
}
