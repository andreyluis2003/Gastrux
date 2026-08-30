'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import {
  THEME_PRESETS,
  ThemeColors,
  ThemePreset,
  applyThemeColors,
  saveThemePreference,
  loadThemePreference,
  saveCustomTheme,
  loadCustomTheme,
} from '@/lib/theme-manager';

export function useThemeCustomizer() {
  const { theme, setTheme } = useTheme();
  const [currentPreset, setCurrentPreset] = useState<string>('modern');
  const [customColors, setCustomColors] = useState<ThemeColors | null>(null);
  const [mounted, setMounted] = useState(false);

  // Initialize on client
  useEffect(() => {
    setMounted(true);
    
    // Load saved preference
    const saved = loadThemePreference();
    if (saved && THEME_PRESETS[saved]) {
      setCurrentPreset(saved);
    }

    // Load custom colors if any
    const custom = loadCustomTheme();
    if (custom) {
      setCustomColors(custom);
      applyThemeColors(custom, theme === 'dark');
    } else {
      // Apply default preset
      const preset = THEME_PRESETS[saved || 'modern'];
      const colors = theme === 'dark' && preset.darkMode ? preset.darkMode : preset.colors;
      applyThemeColors(colors, theme === 'dark');
    }
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = THEME_PRESETS[presetId];
      if (!preset) return;

      const colors = theme === 'dark' && preset.darkMode ? preset.darkMode : preset.colors;
      applyThemeColors(colors, theme === 'dark');
      setCurrentPreset(presetId);
      setCustomColors(null);
      saveThemePreference(presetId);
      localStorage.removeItem('custom-theme');
    },
    [theme]
  );

  const updateColor = useCallback(
    (colorKey: keyof ThemeColors, value: string) => {
      const current = customColors || (THEME_PRESETS[currentPreset]?.colors || {});
      const updated = { ...current, [colorKey]: value } as ThemeColors;

      setCustomColors(updated);
      applyThemeColors(updated, theme === 'dark');
      saveCustomTheme(updated);
    },
    [customColors, currentPreset, theme]
  );

  const resetToPreset = useCallback(() => {
    applyPreset(currentPreset);
  }, [currentPreset, applyPreset]);

  const toggleDarkMode = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    // Reapply colors for new theme
    if (customColors) {
      applyThemeColors(customColors, newTheme === 'dark');
    } else {
      const preset = THEME_PRESETS[currentPreset];
      const colors = newTheme === 'dark' && preset.darkMode ? preset.darkMode : preset.colors;
      applyThemeColors(colors, newTheme === 'dark');
    }
  }, [theme, setTheme, customColors, currentPreset]);

  const getCurrentColors = useCallback((): ThemeColors => {
    if (customColors) return customColors;
    const preset = THEME_PRESETS[currentPreset];
    return theme === 'dark' && preset.darkMode ? preset.darkMode : preset.colors;
  }, [customColors, currentPreset, theme]);

  return {
    mounted,
    theme,
    currentPreset,
    customColors,
    presets: Object.values(THEME_PRESETS),
    applyPreset,
    updateColor,
    resetToPreset,
    toggleDarkMode,
    getCurrentColors,
  };
}
