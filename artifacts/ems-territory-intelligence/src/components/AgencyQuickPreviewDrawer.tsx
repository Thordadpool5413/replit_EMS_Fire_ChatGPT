/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Agency,
  LeadStage,
  FieldNote,
  AgencySourceRecordAssociation,
} from '../types';
import {
  X,
  Bookmark,
  Navigation,
  ExternalLink,
  ArrowRight,
  FileText,
  Send
} from 'lucide-react';
import { formatCurrency, formatEquipmentDisplay, formatInteger, formatPercent } from '../utils/formatters';
import {
  AGENCY_FACT_EVIDENCE_FIELDS,
  hasAgencyFactEvidence,
  hasMappedAgencyFactEvidence
} from '../data/agencyFactEvidence';
import { FireRegistryLookup } from './FireRegistryLookup';
import { EmsRegistryLookup } from './EmsRegistryLookup';
import { AgencySourceRecordWorkspace } from './AgencySourceRecordWorkspace';
import type { AgencySourceRecordData } from '../services/agencySourceRecordStore';
import { getAgencyMedicareDenialMetricForDisplay } from '../services/agencyMedicareDenialService';

interface AgencyQuickPreviewDrawerProps {
  agency: Agency | null;
  onClose: () => void;
  onOpenFullDossier: (agency: Agency) => void;
  onUpdateStage: (agencyId: string, newStage: LeadStage) => void;
  onToggleRoute: (agencyId: string) => void;
  onToggleBookmark: (agencyId: string) => void;
  onAddFieldNote?: (agencyId: string, note: Omit<FieldNote, 'id'>) => void;
  onOpenRfpGenerator?: (agency: Agency) => void;
  onSaveAgencySourceData: (agencyId: string, data: AgencySourceRecordData) => boolean;
  onDecideAgencySourceRecord: (
    agencyId: string,
    association: AgencySourceRecordAssociation,
  ) => void;
}

const STAGES: LeadStage[] = [
  'Target Lead',
  'Contacted / Intro',
  'Demo Scheduled',
  'Clinical Evaluation Trial',
  'RFP / Quoting',
  'Contract Won'
];

export const AgencyQuickPreviewDrawer: React.FC<AgencyQuickPreviewDrawerProps> = ({
  agency,
  onClose,
  onOpenFullDossier,
  onUpdateStage,
  onToggleRoute,
  onToggleBookmark,
  onAddFieldNote,
  onOpenRfpGenerator,
  onSaveAgencySourceData,
  onDecideAgencySourceRecord
}) => {
  const [quickNote, setQuickNote] = useState('');

  useEffect(() => {
    setQuickNote('');
  }, [agency?.id]);

  useEffect(() => {
    if (!agency) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agency, onClose]);

  if (!agency) return null;

  const isFire = agency.agencyType.toLowerCase().includes('fire') || agency.providerCategory === 'FIRE';
  const primaryContact = agency.keyContacts?.[0];
  const npiNumber = agency.npiNumber;
  const nppesUrl = agency.nppesRegistryUrl || (npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${npiNumber}` : 'https://npiregistry.cms.hhs.gov/');
  const usfaUrl = agency.usfaRegistryUrl || 'https://apps.usfa.fema.gov/registry/';
  const mapsUrl =
    agency.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${agency.name}, ${agency.address}`)}`;

  const hasDecisionGradeInputs =
    hasAgencyFactEvidence(agency, 'frontlineApparatusStations') &&
    hasAgencyFactEvidence(agency, 'annualEmergencyVolume') &&
    hasAgencyFactEvidence(agency, 'clinicalOutcomes') &&
    hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
    hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
    hasAgencyFactEvidence(agency, 'cmsClaims') &&
    hasAgencyFactEvidence(agency, 'federalGrant');

  const mappedEvidenceSources = AGENCY_FACT_EVIDENCE_FIELDS
    .filter(({ key }) => hasMappedAgencyFactEvidence(agency, key))
    .map(({ key, label }) => ({ key, label, evidence: agency.factEvidence?.[key] }));

  // Decision scores require reviewed inputs; source-mapped facts remain visible for user review.
  const fleetAgeSub = Math.min(100, Math.round((agency.installedFleet.defibAgeYears / 10) * 100));
  const denialMetric = getAgencyMedicareDenialMetricForDisplay(agency);
  const denialRate = denialMetric?.ratePct ?? null;
  const cmsDenialSub = typeof denialRate === 'number'
    ? Math.min(100, Math.round((denialRate / 25) * 100))
    : 50;
  const clinicalSub = Math.min(
    100,
    Math.round((agency.annualCardiacArrestCalls || 120) / 3.5 + (35 - Math.min(35, agency.utsteinSurvivalRate || 22)) * 1.8)
  );
  const grantSub = agency.grantStatus.afgAwarded ? 95 : 62;

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNote.trim() || !onAddFieldNote) return;
    onAddFieldNote(agency.id, {
      date: new Date().toISOString().split('T')[0],
      repName: 'Territory Manager',
      meetingType: 'Phone Call',
      notes: quickNote.trim(),
      nextAction: `Follow up with ${primaryContact?.name || 'Command Staff'}`,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    });
    setQuickNote('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[1px] animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-preview-title"
    >
      <aside
        className="w-full max-w-[480px] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Sticky Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {isFire ? 'Fire Department' : 'EMS Provider'}
                </span>
                <span>·</span>
                  <span>
                    {agency.stateLicenseNumber
                      ? <>State EMS license <span className="font-mono text-[11px]">{agency.stateLicenseNumber}</span></>
                      : <>FDID <span className="font-mono text-[11px]">{agency.fdid || 'No source mapped'}</span></>}
                  </span>
                <span>·</span>
                <span>NPI <span className="font-mono text-[11px]">{npiNumber || 'No source mapped'}</span></span>
              </div>

              <h2
                id="quick-preview-title"
                className="text-lg font-semibold text-slate-900 dark:text-white tracking-[-0.015em] leading-snug mt-1"
              >
                {agency.name}
              </h2>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {agency.city}, {agency.stateCode} · {agency.county} · ZIP {agency.zipCode}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {hasAgencyFactEvidence(agency, 'providerAddress') ? agency.address : 'No address source mapped'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onToggleBookmark(agency.id)}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
                title={agency.isBookmarked ? 'Remove Bookmark' : 'Bookmark Account'}
              >
                <Bookmark className={`w-4 h-4 ${agency.isBookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                title="Close Preview (Esc)"
                aria-label="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline Stage & Route Triage Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <select
              value={agency.zollOpportunity.salesStage}
              onChange={(e) => onUpdateStage(agency.id, e.target.value as LeadStage)}
              className="h-8 flex-1 min-w-[160px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#1E3A8A] cursor-pointer"
            >
              {STAGES.map((st) => (
                <option key={st} value={st}>
                  Workspace stage: {st}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onToggleRoute(agency.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                agency.inDayRoute
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{agency.inDayRoute ? 'On Route' : '+ Route'}</span>
            </button>

            {onOpenRfpGenerator && (
              <button
                type="button"
                onClick={() => onOpenRfpGenerator(agency)}
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />
                <span>Co-Op RFP</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 2x2 High-Contrast Financial & Fleet Snapshot (1px Hairline Grid) */}
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Executive summary
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden tabular-nums">
              <div className="p-3.5 bg-white dark:bg-slate-900">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Cardiac monitor models</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet')
                    ? `${agency.installedFleet.defibUnitsCount} ${agency.installedFleet.defibBrand} devices`
                    : hasAgencyFactEvidence(agency, 'monitorModelTransition')
                      ? agency.installedFleet.defibBrand
                      : 'Not listed'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block tabular-nums">
                  {hasAgencyFactEvidence(agency, 'monitorModelTransition')
                    ? 'County memo reports LIFEPAK-35 replacement underway; count and completion are not reported.'
                    : 'No source mapped for exact fleet count, age, or contract terms.'}
                </span>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Opportunity estimate</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {hasDecisionGradeInputs ? formatCurrency(agency.zollOpportunity.projectedPipelineValue) : 'Not calculated'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                  {hasDecisionGradeInputs ? `Target: ${agency.zollOpportunity.primaryTargetProduct}` : 'More model inputs are not listed'}
                </span>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Annual Medicare recovery</span>
                <span className="text-sm font-semibold text-[#1E3A8A] dark:text-blue-400 mt-0.5 block tabular-nums">
                  {hasAgencyFactEvidence(agency, 'cmsClaims')
                    ? formatCurrency(agency.cmsData.estimatedRecoverableRevenue, { perYear: true, showSign: true })
                    : 'Not listed'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block tabular-nums">
                  {typeof denialRate === 'number'
                    ? `${formatPercent(denialRate)} ${hasAgencyFactEvidence(agency, 'cmsClaims') ? 'CMS Part B denials' : 'provider profile value'}`
                    : 'Agency record does not list claim denial data'}
                </span>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Fire Rescue calls &amp; outcomes</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {hasAgencyFactEvidence(agency, 'annualCallsReceived')
                    ? `${formatInteger(agency.annualCallVolume)} calls received`
                    : hasAgencyFactEvidence(agency, 'annualEmergencyVolume')
                      ? `${formatInteger(agency.annual911Transports)} transports / yr`
                      : 'Not listed'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block tabular-nums">
                  {hasAgencyFactEvidence(agency, 'annualCallsReceived')
                    ? agency.factEvidence?.annualCallsReceived?.reportingPeriod || 'Reporting period not listed'
                    : hasAgencyFactEvidence(agency, 'clinicalOutcomes')
                      ? `${formatPercent(agency.utsteinSurvivalRate)} Utstein survival`
                    : 'No clinical-outcome source mapped'}
                </span>
              </div>
            </div>
          </div>

          {/* Actuarial PulseIQ Score Breakdown */}
          {hasDecisionGradeInputs ? (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50/50 dark:bg-slate-900 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                PulseIQ Composite Priority Score
              </span>
              <span className="text-sm font-semibold text-[#1E3A8A] dark:text-blue-400 tabular-nums">
                {agency.zollOpportunity.pulseIqScore}/100
              </span>
            </div>

            <div className="space-y-2 text-[11px] tabular-nums">
              {[
                { label: 'Fleet Replacement Pressure (30%)', val: fleetAgeSub, detail: `${agency.installedFleet.defibAgeYears} yr cycle` },
                {
                  label: 'Medicare Claim Recovery (25%)',
                  val: cmsDenialSub,
                  detail: denialRate != null ? `${denialRate}% denial rate` : 'No county-matched rate; neutral score'
                },
                { label: 'Clinical Acuity & Volume (25%)', val: clinicalSub, detail: `${agency.annualCardiacArrestCalls} OHCA/yr` },
                {
                  label: 'FEMA AFG Grant Readiness (20%)',
                  val: grantSub,
                  detail: agency.grantStatus.afgAwarded
                    ? `FY${agency.grantStatus.afgFiscalYear} $${(agency.grantStatus.afgAwardAmount / 1000).toFixed(0)}K`
                    : 'Eligible'
                }
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-slate-900 dark:text-white font-semibold">
                      {row.detail} · {row.val}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1E3A8A] dark:bg-blue-500"
                      style={{ width: `${row.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) : (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              This model output is unavailable because required inputs are not listed in the agency record.
            </div>
          )}

          {/* Command & Infrastructure Details */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Command Contact</span>
              <span className="font-semibold text-slate-900 dark:text-white text-right">
                {hasAgencyFactEvidence(agency, 'agencyLeadership') && primaryContact
                  ? `${primaryContact.name} (${primaryContact.title})`
                  : 'No leadership source mapped'}
              </span>
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Apparatus Baseline</span>
              <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {hasAgencyFactEvidence(agency, 'frontlineApparatusStations')
                  ? `${agency.totalAmbulances} Ambulances · ${agency.totalFireEngines} Engines · ${agency.stationsCount} Stations`
                    : [
                        hasAgencyFactEvidence(agency, 'stationCount') ? `${agency.stationsCount} stations` : 'No station-count source mapped',
                        hasAgencyFactEvidence(agency, 'frontlineRescueUnits') && agency.frontlineRescueUnitCount
                          ? `${agency.frontlineRescueUnitCount} front-line rescue units`
                          : 'No rescue-unit source mapped',
                        hasAgencyFactEvidence(agency, 'frontlineRescueUnits') && agency.responseUnitCount
                          ? `${agency.responseUnitCount} total response units`
                          : 'No vehicle-type source mapped'
                      ].join(' · ')}
              </span>
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Installed ePCR &amp; CAD</span>
              <span className="font-semibold text-slate-900 dark:text-white text-right">
                {hasAgencyFactEvidence(agency, 'epcrSystem')
                  ? `${agency.installedFleet.epcrCadSoftware} · no CAD source mapped`
                  : 'No ePCR or CAD source mapped'}
              </span>
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Public Record Verification</span>
              <div className="flex items-center gap-2.5 font-mono text-[11px]">
                <a
                  href={nppesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1E3A8A] dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  <span>CMS NPPES</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={usfaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1E3A8A] dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  <span>USFA</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1E3A8A] dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Field-specific source map for end-user review */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mapped sources · user review
            </div>
            {mappedEvidenceSources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mappedEvidenceSources.map(({ key, label, evidence }) => evidence?.sourceUrl ? (
                  <a
                    key={key}
                    href={evidence.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${evidence.sourceName}${evidence.sourceKind ? ` · ${evidence.sourceKind.toUpperCase()}` : ''}${evidence.note ? ` · ${evidence.note}` : ''}`}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800 hover:underline dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                  >
                    {label} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span key={key} title={evidence?.note} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    {label} · {(evidence?.sourceKind || 'methodology')} mapped
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">No field-specific sources are mapped to this agency record yet.</p>
            )}
          </section>

          {isFire && (
            <FireRegistryLookup
              agencyName={agency.name}
              city={agency.city}
              stateCode={agency.stateCode}
              fdid={agency.fdid}
              agencyId={agency.id}
              sourceRecordAssociations={agency.sourceRecordAssociations ?? []}
              onDecideSourceRecord={(association) =>
                onDecideAgencySourceRecord(agency.id, association)
              }
            />
          )}
          {!isFire && (
            <EmsRegistryLookup
              agencyName={agency.name}
              city={agency.city}
              stateCode={agency.stateCode}
              agencyId={agency.id}
              sourceRecordAssociations={agency.sourceRecordAssociations ?? []}
              onDecideSourceRecord={(association) =>
                onDecideAgencySourceRecord(agency.id, association)
              }
            />
          )}
          <AgencySourceRecordWorkspace
            agency={agency}
            onSave={(data) => onSaveAgencySourceData(agency.id, data)}
          />

          {/* Quick Field Note Logger */}
          {onAddFieldNote && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Field Activity &amp; Cloud Notes ({agency.fieldNotes?.length || 0})
              </div>

              <form onSubmit={handleSaveNote} className="flex items-center gap-2">
                <input
                  type="text"
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  placeholder="Log a quick call or visit note to Firestore..."
                  className="flex-1 h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                />
                <button
                  type="submit"
                  disabled={!quickNote.trim()}
                  className="h-8 px-3 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold disabled:opacity-40 hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Log</span>
                </button>
              </form>

              {agency.fieldNotes && agency.fieldNotes.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{agency.fieldNotes[0].repName} · {agency.fieldNotes[0].meetingType}</span>
                    <span>{agency.fieldNotes[0].date}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 text-xs leading-snug">
                    {agency.fieldNotes[0].notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Primary CTA Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
          >
            Back to List
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullDossier(agency);
            }}
            className="h-9 flex-1 px-4 rounded-lg bg-[#1E3A8A] hover:bg-[#172554] dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Open Full Actuarial Dossier</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    </div>
  );
};
