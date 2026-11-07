export const THEME_MODE_OPTIONS = [
  { value: 'daylight', label: 'Daylight' },
  { value: 'dark', label: 'Dark' },
  { value: 'miami-vice', label: 'Miami Vice' },
] as const;

export type ThemeMode = (typeof THEME_MODE_OPTIONS)[number]['value'];

export function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_MODE_OPTIONS.some((option) => option.value === value);
}
