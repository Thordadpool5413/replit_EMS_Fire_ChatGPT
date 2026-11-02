import type { Agency } from '../types';

type AgencyCompareButtonProps = {
  agency: Agency;
  selected: boolean;
  limitReached: boolean;
  onToggle: (agency: Agency) => void;
  className?: string;
};

export function AgencyCompareButton({
  agency,
  selected,
  limitReached,
  onToggle,
  className = '',
}: AgencyCompareButtonProps) {
  const unavailable = limitReached && !selected;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `Remove ${agency.name} from comparison` : `Add ${agency.name} to comparison`}
      title={unavailable ? 'Remove an agency from the comparison to add another' : undefined}
      disabled={unavailable}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(agency);
      }}
      className={`inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-950'
          : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-800 dark:hover:bg-teal-950/40 dark:hover:text-teal-200'
      } ${className}`}
      data-testid={`button-toggle-comparison-${agency.id}`}
    >
      {selected ? 'Added' : 'Compare'}
    </button>
  );
}
