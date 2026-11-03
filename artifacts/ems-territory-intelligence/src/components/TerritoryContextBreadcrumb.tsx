import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';

export type TerritoryProviderScope = 'all' | 'ems' | 'fire';

export interface TerritoryContextBreadcrumbProps {
  state?: string | null;
  stateLabel?: string | null;
  county?: string | null;
  city?: string | null;
  agencyName?: string | null;
  providerScope?: TerritoryProviderScope;
  onSelectUnitedStates?: () => void;
  onSelectState?: (state: string) => void;
  onSelectCounty?: (county: string) => void;
  onSelectCity?: (city: string) => void;
  className?: string;
}

const hasSelection = (value?: string | null) =>
  Boolean(value?.trim() && value.trim().toLowerCase() !== 'all');

const scopeLabels: Record<TerritoryProviderScope, string> = {
  all: 'All providers',
  ems: 'EMS',
  fire: 'Fire',
};

/**
 * Compact geography context for territory and agency workspaces.
 * Geography callbacks are intentionally controlled by the parent application.
 */
export const TerritoryContextBreadcrumb: React.FC<TerritoryContextBreadcrumbProps> = ({
  state,
  stateLabel,
  county,
  city,
  agencyName,
  providerScope,
  onSelectUnitedStates,
  onSelectState,
  onSelectCounty,
  onSelectCity,
  className = '',
}) => {
  const selectedState = hasSelection(state) ? state!.trim() : null;
  const selectedCounty = hasSelection(county) ? county!.trim() : null;
  const selectedCity = hasSelection(city) ? city!.trim() : null;
  const selectedAgency = agencyName?.trim() || null;
  const items: Array<{
    key: string;
    label: string;
    onSelect?: () => void;
    current?: boolean;
  }> = [
    {
      key: 'united-states',
      label: 'United States',
      onSelect: onSelectUnitedStates,
      current: !selectedState,
    },
  ];

  if (selectedState) {
    items.push({
      key: 'state',
      label: stateLabel?.trim() || selectedState,
      onSelect: onSelectState ? () => onSelectState(selectedState) : undefined,
      current: !selectedCounty && !selectedCity && !selectedAgency,
    });
  }
  if (selectedCounty) {
    items.push({
      key: 'county',
      label: selectedCounty,
      onSelect: onSelectCounty ? () => onSelectCounty(selectedCounty) : undefined,
      current: !selectedCity && !selectedAgency,
    });
  }
  if (selectedCity) {
    items.push({
      key: 'city',
      label: selectedCity,
      onSelect: onSelectCity ? () => onSelectCity(selectedCity) : undefined,
      current: !selectedAgency,
    });
  }

  return (
    <nav
      aria-label="Selected territory"
      className={`flex min-w-0 items-center gap-2 rounded-lg border border-[#D8E1E5] bg-[#FBFCFC] px-2.5 py-1.5 text-xs shadow-[0_1px_2px_rgba(22,48,60,0.035)] dark:border-[#2A3D49] dark:bg-[#14232E] ${className}`}
      data-testid="territory-context-breadcrumb"
    >
      <MapPin
        className="h-3.5 w-3.5 shrink-0 text-[#176568] dark:text-[#74BBB5]"
        aria-hidden="true"
      />
      <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap no-scrollbar">
        {items.map((item, index) => (
          <li key={item.key} className="flex min-w-0 shrink-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[#91A1AD] dark:text-slate-500"
                aria-hidden="true"
              />
            )}
            {item.onSelect && !item.current ? (
              <button
                type="button"
                onClick={item.onSelect}
                className="max-w-[9rem] truncate rounded-sm px-0.5 py-1 font-medium text-[#53657B] transition-colors hover:text-[#176568] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#176568] dark:text-slate-300 dark:hover:text-[#A5D6D2] dark:focus-visible:outline-[#74BBB5] sm:max-w-[14rem]"
                aria-label={`Show ${item.label} territory`}
                data-testid={`breadcrumb-${item.key}`}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`max-w-[9rem] truncate px-0.5 py-1 ${
                  item.current
                    ? 'font-semibold text-[#14283F] dark:text-slate-100'
                    : 'font-medium text-[#53657B] dark:text-slate-300'
                }`}
                aria-current={item.current ? 'location' : undefined}
                title={item.label}
                data-testid={`breadcrumb-${item.key}`}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
        {selectedAgency && (
          <li className="flex min-w-0 shrink-0 items-center gap-1">
            <ChevronRight
              className="h-3 w-3 shrink-0 text-[#91A1AD] dark:text-slate-500"
              aria-hidden="true"
            />
            <span
              className="max-w-[11rem] truncate rounded bg-[#E7F1F0] px-1.5 py-1 font-semibold text-[#176568] dark:bg-[#193737] dark:text-[#A5D6D2] sm:max-w-[18rem]"
              aria-current="location"
              title={selectedAgency}
              data-testid="breadcrumb-agency"
            >
              {selectedAgency}
            </span>
          </li>
        )}
      </ol>
      {providerScope && (
        <span
          className="shrink-0 border-l border-[#D8E1E5] pl-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#53657B] dark:border-[#2A3D49] dark:text-slate-300"
          aria-label={`Provider scope: ${scopeLabels[providerScope]}`}
          data-testid="territory-provider-scope"
        >
          {scopeLabels[providerScope]}
        </span>
      )}
    </nav>
  );
};

export default TerritoryContextBreadcrumb;
