/** Readable active-filter context for collapsed mobile filter groups. */
export interface FilterContextEntry { label: string; active: boolean }

export const activeFilterLabels = (entries: FilterContextEntry[]): string[] =>
  entries.filter(e => e.active && e.label.trim()).map(e => e.label.trim());

export const describeActiveFilters = (entries: FilterContextEntry[]): string => {
  const labels = activeFilterLabels(entries);
  return labels.length === 0 ? 'No filters applied' : labels.join(' · ');
};

