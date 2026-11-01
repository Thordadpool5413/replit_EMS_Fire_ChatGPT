import { useState, type FormEvent } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import {
  AGENCY_FACT_EVIDENCE_FIELDS,
} from "../data/agencyFactEvidence";
import type {
  Agency,
  AgencySourceFact,
  AgencySourceFactBasis,
  GeographicLevel,
  GeographicRelationship,
} from "../types";
import type { AgencySourceRecordData } from "../services/agencySourceRecordStore";

const GEOGRAPHIC_LEVELS: Array<{ value: GeographicLevel; label: string }> = [
  { value: "agency", label: "This agency" },
  { value: "station", label: "Station" },
  { value: "service-area", label: "Service area" },
  { value: "county", label: "County" },
  { value: "place", label: "City / place" },
  { value: "zip", label: "ZIP code" },
  { value: "tract", label: "Census tract" },
  { value: "state", label: "State" },
  { value: "national", label: "National" },
];

const GEOGRAPHIC_RELATIONSHIPS: Array<{
  value: GeographicRelationship;
  label: string;
}> = [
  { value: "serves", label: "Agency serves this geography" },
  { value: "operates-station-in", label: "Agency operates a station here" },
  { value: "located-at", label: "Agency is located here" },
  { value: "headquartered-in", label: "Agency is headquartered here" },
];

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const LABEL_CLASS =
  "mb-1 block text-[10px] font-semibold text-slate-600 dark:text-slate-300";

function formatDate(value?: string | null): string {
  if (!value) return "Not stated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function factLabel(key: AgencySourceFact["fieldKey"]): string {
  return (
    AGENCY_FACT_EVIDENCE_FIELDS.find((field) => field.key === key)?.label ??
    key
  );
}

type AgencySourceRecordWorkspaceProps = {
  agency: Agency;
  onSave: (data: AgencySourceRecordData) => boolean;
};

export function AgencySourceRecordWorkspace({
  agency,
  onSave,
}: AgencySourceRecordWorkspaceProps) {
  const associations = agency.sourceRecordAssociations ?? [];
  const facts = agency.sourceFacts ?? [];
  const [isAdding, setIsAdding] = useState(false);
  const [fieldKey, setFieldKey] =
    useState<AgencySourceFact["fieldKey"]>("annualEmergencyVolume");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceRecordId, setSourceRecordId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [effectivePeriod, setEffectivePeriod] = useState("");
  const [geographicLevel, setGeographicLevel] =
    useState<GeographicLevel>("agency");
  const [geographicId, setGeographicId] = useState(agency.id);
  const [geographicRelationship, setGeographicRelationship] =
    useState<GeographicRelationship | "">("");
  const [basis, setBasis] =
    useState<AgencySourceFactBasis>("source-reported");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setValue("");
    setUnit("");
    setSourceName("");
    setSourceRecordId("");
    setSourceUrl("");
    setReportingPeriod("");
    setEffectivePeriod("");
    setGeographicLevel("agency");
    setGeographicId(agency.id);
    setGeographicRelationship("");
    setBasis("source-reported");
    setNote("");
    setFormError("");
  };

  const handleLevelChange = (next: GeographicLevel) => {
    setGeographicLevel(next);
    setGeographicId(next === "agency" ? agency.id : "");
    setGeographicRelationship(
      next === "agency"
        ? ""
        : next === "station"
          ? "operates-station-in"
          : "serves",
    );
  };

  const handleAddFact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    const normalizedSourceName = sourceName.trim();
    const normalizedSourceRecordId = sourceRecordId.trim();
    const normalizedUrl = sourceUrl.trim();
    const requiresGeographyLink = geographicLevel !== "agency";

    if (
      !normalizedValue ||
      !normalizedSourceName ||
      !normalizedSourceRecordId ||
      (requiresGeographyLink && !geographicId.trim()) ||
      (requiresGeographyLink && !geographicRelationship)
    ) {
      setFormError(
        "Enter a value, source name, source record ID, and the selected geography details.",
      );
      return;
    }
    if (normalizedUrl) {
      try {
        if (new URL(normalizedUrl).protocol !== "https:") {
          setFormError("Source links must use HTTPS.");
          return;
        }
      } catch {
        setFormError("Enter a valid HTTPS source link or leave it blank.");
        return;
      }
    }

    const fact: AgencySourceFact = {
      id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fieldKey,
      value: normalizedValue,
      unit: unit.trim() || undefined,
      sourceName: normalizedSourceName,
      sourceRecordId: normalizedSourceRecordId,
      sourceUrl: normalizedUrl || undefined,
      reportingPeriod: reportingPeriod.trim() || undefined,
      effectivePeriod: effectivePeriod.trim() || undefined,
      geographicLevel,
      geographicId: geographicLevel === "agency" ? agency.id : geographicId.trim(),
      geographicRelationship: geographicRelationship || undefined,
      basis,
      note: note.trim() || undefined,
      enteredAt: new Date().toISOString(),
    };

    if (
      onSave({
        sourceRecordAssociations: associations,
        sourceFacts: [fact, ...facts],
      })
    ) {
      resetForm();
      setIsAdding(false);
    }
  };

  const handleRemoveFact = (factId: string) => {
    if (
      !window.confirm(
        "Remove this source-backed fact from this browser’s saved agency record?",
      )
    ) {
      return;
    }
    onSave({
      sourceRecordAssociations: associations,
      sourceFacts: facts.filter((fact) => fact.id !== factId),
    });
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby={`agency-source-workspace-${agency.id}`}
      data-testid="panel-agency-source-workspace"
    >
      <div className="border-b border-slate-100 px-3.5 py-3 dark:border-slate-800">
        <h3
          id={`agency-source-workspace-${agency.id}`}
          className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200"
        >
          Saved source records &amp; facts
        </h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
          These decisions and entries are saved in this browser only. They do
          not change registry facts or overwrite the agency’s existing fields.
        </p>
      </div>

      <div className="space-y-4 p-3.5">
        <div>
          <h4 className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
            Registry match decisions ({associations.length})
          </h4>
          {associations.length === 0 ? (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              No CMS NPI, USFA, or NERIS candidate decisions saved for this
              agency.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {associations.map((association) => (
                <li
                  key={association.id}
                  className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700"
                  data-testid={`saved-source-association-${association.sourceRecordId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        {association.sourceName} · {association.sourceRecordId}
                      </p>
                      <p
                        className={`mt-0.5 text-[10px] font-semibold ${
                          association.decision === "confirmed"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {association.decision === "confirmed"
                          ? "User associated with this agency"
                          : "User rejected for this agency"}
                      </p>
                    </div>
                    <a
                      href={association.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      Open record <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-slate-500 dark:text-slate-400">
                    <div>
                      <dt>Source date</dt>
                      <dd className="font-medium text-slate-700 dark:text-slate-200">
                        {formatDate(association.sourceDate)}
                      </dd>
                    </div>
                    <div>
                      <dt>Retrieved</dt>
                      <dd className="font-medium text-slate-700 dark:text-slate-200">
                        {formatDate(association.retrievedAt)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Match basis: {association.matchBasis}
                  </p>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                      Source fields saved
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[9px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {JSON.stringify(association.sourceFields, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                Source-backed agency facts ({facts.length})
              </h4>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                Record observations with their exact scope and period.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAdding((current) => !current);
                setFormError("");
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              data-testid="button-toggle-agency-source-fact-form"
            >
              <Plus className="h-3.5 w-3.5" />
              {isAdding ? "Close form" : "Add fact"}
            </button>
          </div>

          {facts.length > 0 && (
            <ul className="mt-2 space-y-2">
              {facts.map((fact) => (
                <li
                  key={fact.id}
                  className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700"
                  data-testid={`saved-source-fact-${fact.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {factLabel(fact.fieldKey)}
                      </p>
                      <p className="break-words text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                        {fact.value}
                        {fact.unit ? ` ${fact.unit}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFact(fact.id)}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 px-2 text-[9px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                      aria-label={`Remove ${factLabel(fact.fieldKey)} fact`}
                      data-testid={`button-remove-source-fact-${fact.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {fact.sourceName} · record {fact.sourceRecordId}
                    {fact.sourceUrl && (
                      <>
                        {" · "}
                        <a
                          href={fact.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-blue-700 hover:underline dark:text-blue-300"
                        >
                          Open source <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                    Scope: {fact.geographicLevel} · {fact.geographicId}
                    {fact.geographicRelationship
                      ? ` · ${fact.geographicRelationship}`
                      : ""}
                    {" · "}Basis: {fact.basis}
                  </p>
                  {(fact.reportingPeriod || fact.effectivePeriod) && (
                    <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                      {fact.reportingPeriod
                        ? `Reporting period: ${fact.reportingPeriod}`
                        : ""}
                      {fact.reportingPeriod && fact.effectivePeriod ? " · " : ""}
                      {fact.effectivePeriod
                        ? `Effective period: ${fact.effectivePeriod}`
                        : ""}
                    </p>
                  )}
                  {fact.note && (
                    <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                      {fact.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isAdding && (
            <form
              className="mt-3 space-y-3 rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"
              onSubmit={handleAddFact}
              data-testid="form-add-agency-source-fact"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  <span className={LABEL_CLASS}>Fact category</span>
                  <select
                    className={INPUT_CLASS}
                    value={fieldKey}
                    onChange={(event) =>
                      setFieldKey(
                        event.target.value as AgencySourceFact["fieldKey"],
                      )
                    }
                  >
                    {AGENCY_FACT_EVIDENCE_FIELDS.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={LABEL_CLASS}>Reported value</span>
                  <input
                    className={INPUT_CLASS}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    maxLength={300}
                    required
                    placeholder="Enter the exact value"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Unit (optional)</span>
                  <input
                    className={INPUT_CLASS}
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                    maxLength={40}
                    placeholder="calls/year, units, vendor..."
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Source name</span>
                  <input
                    className={INPUT_CLASS}
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    maxLength={160}
                    required
                    placeholder="Agency report, contract, account disclosure"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Source record ID or citation</span>
                  <input
                    className={INPUT_CLASS}
                    value={sourceRecordId}
                    onChange={(event) => setSourceRecordId(event.target.value)}
                    maxLength={180}
                    required
                    placeholder="Document number, page, asset ID..."
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>HTTPS source link (optional)</span>
                  <input
                    className={INPUT_CLASS}
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    type="url"
                    maxLength={1000}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Reporting period (optional)</span>
                  <input
                    className={INPUT_CLASS}
                    value={reportingPeriod}
                    onChange={(event) => setReportingPeriod(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. FY2025 or Jan–Dec 2025"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Effective period (optional)</span>
                  <input
                    className={INPUT_CLASS}
                    value={effectivePeriod}
                    onChange={(event) => setEffectivePeriod(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. 2025-07 to 2028-06"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Geographic scope</span>
                  <select
                    className={INPUT_CLASS}
                    value={geographicLevel}
                    onChange={(event) =>
                      handleLevelChange(event.target.value as GeographicLevel)
                    }
                  >
                    {GEOGRAPHIC_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </label>
                {geographicLevel !== "agency" && (
                  <>
                    <label>
                      <span className={LABEL_CLASS}>
                        Native geography ID
                      </span>
                      <input
                        className={INPUT_CLASS}
                        value={geographicId}
                        onChange={(event) => setGeographicId(event.target.value)}
                        maxLength={120}
                        required
                        placeholder="FIPS, GEOID, ZIP, station ID..."
                      />
                    </label>
                    <label>
                      <span className={LABEL_CLASS}>
                        Relationship to agency
                      </span>
                      <select
                        className={INPUT_CLASS}
                        value={geographicRelationship}
                        onChange={(event) =>
                          setGeographicRelationship(
                            event.target.value as GeographicRelationship | "",
                          )
                        }
                        required
                      >
                        <option value="">Choose a relationship</option>
                        {GEOGRAPHIC_RELATIONSHIPS.map((relationship) => (
                          <option
                            key={relationship.value}
                            value={relationship.value}
                          >
                            {relationship.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  <span className={LABEL_CLASS}>Value basis</span>
                  <select
                    className={INPUT_CLASS}
                    value={basis}
                    onChange={(event) =>
                      setBasis(event.target.value as AgencySourceFactBasis)
                    }
                  >
                    <option value="source-reported">Source-reported</option>
                    <option value="user-entered">User-entered</option>
                    <option value="calculated">Calculated</option>
                  </select>
                </label>
                <label className="sm:col-span-2">
                  <span className={LABEL_CLASS}>Calculation or context note</span>
                  <textarea
                    className={`${INPUT_CLASS} h-16 py-2`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                    placeholder="Optional method, source field, or context"
                  />
                </label>
              </div>
              {formError && (
                <p
                  className="text-[10px] font-medium text-rose-700 dark:text-rose-300"
                  role="alert"
                >
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsAdding(false);
                  }}
                  className="h-8 rounded-md border border-slate-200 px-3 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-700 px-3 text-[10px] font-semibold text-white hover:bg-blue-800"
                  data-testid="button-save-agency-source-fact"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save fact
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
