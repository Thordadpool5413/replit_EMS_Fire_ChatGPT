import React, { useId, useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { activeFilterLabels, type FilterContextEntry } from '../utils/filterSummary';

interface Props {
  /** Test-id stem: produces `${testId}`, `${testId}-toggle`, `${testId}-context`. */
  testId: string;
  filters: FilterContextEntry[];
  defaultOpen?: boolean;
  /** Controlled open state, so sibling control groups can follow the same toggle. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Non-filter context (e.g. non-default sort) shown in the label but not counted. */
  extraContext?: string[];
  additionalControlsId?: string;
  children: React.ReactNode;
}

/**
 * Secondary filters only. Below `sm` the group collapses behind a toggle that always
 * names the applied constraints; at `sm` and above the toggle disappears and the
 * children render inline (display: contents) so desktop layout is unchanged.
 * Children stay mounted while collapsed, so filter state is never lost.
 */
export const MobileFilterDisclosure: React.FC<Props> = ({ testId, filters, defaultOpen = false, open: openProp, onOpenChange, extraContext = [], additionalControlsId, children }) => {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => { setOpenState(next); onOpenChange?.(next); };
  const panelId = useId();
  const labels = activeFilterLabels(filters);
  return (
    <>
      <button
        type="button"
        className="mobile-filter-toggle sm:hidden w-full min-h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-controls={[panelId, additionalControlsId].filter(Boolean).join(' ')}
        onClick={() => setOpen(!open)}
        data-testid={`${testId}-toggle`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Filters &amp; view</span>
        {labels.length > 0 && (
          <span className="pi-data-number text-[11px] bg-[#1E3A8A] text-white px-1.5 py-0.5 rounded" data-testid={`${testId}-count`}>{labels.length}</span>
        )}
        <span className="min-w-0 flex-1 break-words font-medium text-slate-500 dark:text-slate-400" data-testid={`${testId}-context`}>
          {[labels.length > 0 ? labels.join(' · ') : 'None applied', ...extraContext].join(' · ')}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className={`mobile-filter-panel ${open ? 'flex' : 'hidden'} sm:contents w-full flex-wrap items-center gap-2`}
        data-testid={testId}
        data-open={open ? 'true' : 'false'}
      >
        {children}
      </div>
    </>
  );
};
