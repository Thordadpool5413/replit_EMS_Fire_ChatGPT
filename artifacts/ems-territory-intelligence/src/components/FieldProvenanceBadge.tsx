import { ExternalLink } from 'lucide-react';
import {
  resolveProfileFieldProvenance,
  type FieldProvenanceKind
} from '../data/profileFieldProvenance';

const statusStyles: Record<FieldProvenanceKind, string> = {
  live_record: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  source_linked: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  local_claim: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  modeled: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800',
  unavailable: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

interface FieldProvenanceBadgeProps {
  rawProfile: unknown;
  profile: unknown;
  fieldPath: string;
  kindOverride?: FieldProvenanceKind;
  explanationOverride?: string;
  className?: string;
}

export function FieldProvenanceBadge({
  rawProfile,
  profile,
  fieldPath,
  kindOverride,
  explanationOverride,
  className = ''
}: FieldProvenanceBadgeProps) {
  const resolved = resolveProfileFieldProvenance(rawProfile, profile, fieldPath);
  const overrideLabels: Record<FieldProvenanceKind, string> = {
    live_record: 'Live record',
    source_linked: 'Source linked',
    local_claim: 'Local claim',
    modeled: 'Modeled',
    unavailable: 'Not provided'
  };
  const provenance = kindOverride
    ? {
        ...resolved,
        kind: kindOverride,
        label: overrideLabels[kindOverride],
        explanation: explanationOverride || resolved.explanation,
        sourceUrl: kindOverride === 'live_record' || kindOverride === 'source_linked' ? resolved.sourceUrl : undefined
      }
    : resolved;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold leading-tight whitespace-nowrap ${statusStyles[provenance.kind]} ${className}`}
      title={provenance.explanation}
      aria-label={`${provenance.label}: ${provenance.explanation}`}
    >
      {provenance.label}
      {provenance.sourceUrl && (
        <a
          href={provenance.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open source for ${fieldPath}`}
          title="Open source"
          className="inline-flex items-center hover:opacity-75"
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </span>
  );
}
