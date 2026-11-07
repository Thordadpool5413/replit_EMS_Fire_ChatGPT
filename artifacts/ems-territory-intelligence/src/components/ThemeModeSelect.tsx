import React from 'react';
import { isThemeMode, THEME_MODE_OPTIONS, type ThemeMode } from '../types/theme';

interface ThemeModeSelectProps {
  controlId: string;
  testId: string;
  themeMode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  className?: string;
}

export const ThemeModeSelect: React.FC<ThemeModeSelectProps> = ({
  controlId,
  testId,
  themeMode,
  onChange,
  className = '',
}) => (
  <select
    id={controlId}
    data-testid={testId}
    aria-label="Appearance theme"
    value={themeMode}
    onChange={(event) => {
      if (isThemeMode(event.currentTarget.value)) onChange(event.currentTarget.value);
    }}
    className={`pi-theme-select ${className}`.trim()}
  >
    {THEME_MODE_OPTIONS.map((option) => (
      <option key={option.value} value={option.value}>{option.label}</option>
    ))}
  </select>
);
