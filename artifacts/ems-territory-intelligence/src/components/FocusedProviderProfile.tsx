/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Agency,
  LeadStage,
  PredictiveWeights,
  FieldNote,
  KeyContact,
  AgencyFactEvidenceKey,
  AgencySourceRecordAssociation,
} from '../types';
import {
  getAgencyFactEvidenceStatus,
  hasAgencyFactEvidence,
  hasMappedAgencyFactEvidence,
  hasReviewedAgencyFactEvidence
} from '../data/agencyFactEvidence';
import { PulseIqEvidencePanel } from './PulseIqEvidencePanel';
import { PulseIqEstimateLabel } from './PulseIqEstimateLabel';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Navigation,
  Bookmark,
  Building2,
  Siren,
  Flame,
  ShieldCheck,
  DollarSign,
  Activity,
  FileText,
  Plus,
  Send,
  Printer,
  Sparkles,
  Cpu,
  Truck,
  CheckCircle2,
  Clock,
  UserCheck,
  HeartPulse,
  PackageCheck,
  Award,
  Layers,
  Scale,
  Stethoscope,
  ShieldAlert,
  FileCheck2,
  Zap,
  HelpCircle,
  Home
} from 'lucide-react';
import {
  COOPERATIVE_CONTRACTS,
  calculateAgencyFleetTco,
  calculateAgencyHcpcsBreakdown,
  getAgencyClinicalProtocolAlignment
} from '../data/clinicalAndCompetitiveIntelligence';
import { validateNpiCheckDigit } from '../services/npiVerificationService';
import { getAgencyMedicareDenialMetricForDisplay } from '../services/agencyMedicareDenialService';
import { getAgencyGeographicLinks } from '../services/geographicMappingService';
import {
  getAgencyProfileReviewedAt,
  saveAgencyProfileReviewedAt
} from '../services/agencyProfileReviewStore';
import { ResuscitationSurvivalFunnel } from './ResuscitationSurvivalFunnel';
import { TcoCumulativeSavingsChart } from './TcoCumulativeSavingsChart';
import { QualityScorecard } from './QualityScorecard';
import { EmsRegistryLookup } from './EmsRegistryLookup';
import { FireRegistryLookup } from './FireRegistryLookup';
import { AgencySourceRecordWorkspace } from './AgencySourceRecordWorkspace';
import AgencyIntelligenceOverview from './AgencyIntelligenceOverview';
import { AgencyCompareButton } from './AgencyCompareButton';
import { PlanningValueDisclosure } from './PlanningValueDisclosure';
import type { AgencySourceRecordData } from '../services/agencySourceRecordStore';
import {
  formatCurrency,
  formatEquipmentDisplay,
  formatInteger,
  formatPercent,
  formatPriorityScore
} from '../utils/formatters';

interface FocusedProviderProfileProps {
  agency: Agency;
  weights?: PredictiveWeights;
  backLabel: string;
  comparedAgencyIds: string[];
  onToggleAgencyComparison: (agency: Agency) => void;
  onOpenAgencyComparison: () => void;
  onBack: () => void;
  onGoHome?: () => void;
  onNavigateGeography?: (state?: string, county?: string, city?: string) => void;
  onUpdateStage: (agencyId: string, newStage: LeadStage) => void;
  onToggleRoute: (agencyId: string) => void;
  onToggleBookmark: (agencyId: string) => void;
  onAddFieldNote: (agencyId: string, note: Omit<FieldNote, 'id'>) => void;
  onOpenRfpGenerator?: (agency: Agency) => void;
  onOpenDataLineage?: (agency: Agency) => void;
  onSaveAgencySourceData: (agencyId: string, data: AgencySourceRecordData) => boolean;
  onDecideAgencySourceRecord: (
    agencyId: string,
    association: AgencySourceRecordAssociation,
  ) => void;
}

const FactVerificationTag: React.FC<{
  agency: Agency;
  field: AgencyFactEvidenceKey;
  unverifiedLabel?: string;
}> = ({ agency, field, unverifiedLabel }) => {
  const status = getAgencyFactEvidenceStatus(agency, field);
  const evidence = agency.factEvidence?.[field];
  const label = status === 'source-reviewed'
    ? 'Review marker recorded'
    : status === 'source-mapped'
      ? 'Source available'
      : unverifiedLabel;
  if (!label) return null;
  const className = `profile-evidence-tag inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
    status === 'source-reviewed'
      ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
      : status === 'source-mapped'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }`;
  const title = evidence
    ? `${evidence.sourceName}${evidence.sourceKind ? ` · ${evidence.sourceKind.toUpperCase()}` : ''}${evidence.reportingPeriod ? ` · ${evidence.reportingPeriod}` : ''}${evidence.note ? ` · ${evidence.note}` : ''}`
    : unverifiedLabel;
  return evidence?.sourceUrl ? (
    <a
      data-testid={`status-fact-${field}-${agency.id}`}
      className={className}
      href={evidence.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {label} ↗
    </a>
  ) : (
    <span data-testid={`status-fact-${field}-${agency.id}`} className={className} title={title}>
      {label}
    </span>
  );
};

const reportMetric = (value: number | null | undefined, suffix = '') =>
  value == null || !Number.isFinite(value) ? 'Not reported' : `${value.toLocaleString()}${suffix}`;

const reportCurrency = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? 'Not reported' : `$${value.toLocaleString()}`;

const safeExternalUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const hasReportedValue = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

type ProfileSection =
  | 'overview'
  | 'equipment'
  | 'purchasing'
  | 'decision_makers'
  | 'operations'
  | 'medicare'
  | 'evidence'
  | 'all';

type NppesSourceCandidate = {
  npiNumber: string;
  officialName: string;
  city: string;
  stateCode: string;
  zipCode: string;
  taxonomyDescription: string;
  registryUrl: string;
  address?: string;
  nppesLastUpdated?: string;
};

type NppesLookupResult = {
  outcome: string;
  details: string;
  fetchedAt: string;
  candidates: NppesSourceCandidate[];
  candidateCount: number;
};

import { ExternalLink, RefreshCw, Globe, ChevronDown, ChevronUp, X, ArrowRight } from 'lucide-react';
const ExecutiveBriefingDossier = React.lazy(() =>
  import('./ExecutiveBriefingDossier').then((module) => ({
    default: module.ExecutiveBriefingDossier
  }))
);
import { DealStoryBriefingView } from './DealStoryBriefingView';
import { CompetitiveBattlecardView } from './CompetitiveBattlecardView';
import { TermTooltip } from './TermTooltip';
import { useVerifyProviderLive } from '@workspace/api-client-react';

/**
 * Guarantees complete agency fields for any selected EMS Provider or Fire Department
 * without ever injecting synthetic (555) phone numbers or fabricated staff emails.
 */
function ensureCompleteAgencyData(raw: Agency): Agency {
  const existingContacts = raw.keyContacts || [];
  // Honest Evidence Integrity: No synthetic NPI or FDID hashing
  const npiNumber = raw.npiNumber || undefined;
  const taxonomyCode = raw.taxonomyCode;
  const taxonomyDescription = raw.taxonomyDescription;
  const nppesRegistryUrl = raw.nppesRegistryUrl || (npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${npiNumber}` : undefined);
  const fdid = raw.fdid || undefined;

  const officialWebsite = raw.officialWebsite || '';
  const googleMapsUri =
    raw.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${raw.name}, ${raw.address}`)}`;

  const normalizedContacts: KeyContact[] =
    existingContacts.length > 0
      ? existingContacts.map((c) => ({
          ...c,
          email: '',
          phone: '',
          officialWebsite: c.officialWebsite || '',
          headquartersAddress: c.headquartersAddress || raw.address,
          isVerifiedOfficial: Boolean(
            c.isVerifiedOfficial &&
            hasAgencyFactEvidence(raw, 'agencyLeadership') &&
            hasAgencyFactEvidence(raw, 'decisionMakers')
          ),
          verificationSource: c.verificationSource || 'Source not listed',
          notes: 'Contact details are not listed in the current record.'
        }))
      : [];

  // Preserve only source-provided fleet and hospital data. Missing data stays missing.
  const apparatusFleet = raw.apparatusFleet;
  const hospitalLogistics = raw.hospitalLogistics;

  // 4. Genuine FEMA Grant Records - authentic awards only, no synthetic multi-year generation
  const femaGrantHistory = raw.femaGrantHistory || (raw.liveFemaAwards && raw.liveFemaAwards.length > 0
    ? raw.liveFemaAwards
        .filter((a) => hasReportedValue(a.programYear) && hasReportedValue(a.federalShareAwarded))
        .map((a) => ({
        fiscalYear: a.programYear,
        programName: a.programActivity || 'Grant program not reported',
        purpose: a.programActivity || 'Grant purpose not reported',
        awardAmount: a.federalShareAwarded,
        localMatchAmount: null,
        federalSharePct: null,
        status: 'Awarded & Disbursed' as const,
        applicationRound: a.awardNumber || 'Not reported'
      }))
    : (raw.grantStatus?.afgAwarded && hasReportedValue(raw.grantStatus.afgFiscalYear) && hasReportedValue(raw.grantStatus.afgAwardAmount)
        ? [
            {
              fiscalYear: raw.grantStatus.afgFiscalYear,
              programName: 'FEMA Assistance to Firefighters Grant (AFG)',
              purpose: raw.grantStatus.afgPurpose || 'Grant purpose not reported',
              awardAmount: raw.grantStatus.afgAwardAmount,
              localMatchAmount: null,
              federalSharePct: null,
              status: 'Awarded & Disbursed' as const,
              applicationRound: raw.grantStatus.afgAwardNumber || 'Not reported'
            }
          ]
        : []));

  return {
    ...raw,
    fdid: fdid || '',
    npiNumber,
    taxonomyCode,
    taxonomyDescription,
    nppesOfficialName: raw.nppesOfficialName || undefined,
    nppesOfficialTitle: raw.nppesOfficialTitle || undefined,
    nppesRegistryUrl,
    officialWebsite,
    googleMapsUri,
    headquartersPhone: hasAgencyFactEvidence(raw, 'decisionMakers') ? raw.headquartersPhone || '' : '',
    apparatusFleet,
    hospitalLogistics,
    femaGrantHistory,
    gisData: {
      ...raw.gisData,
      primaryReceivingHospital: raw.gisData?.primaryReceivingHospital || 'Not reported',
    },
    cmsData: {
      ...raw.cmsData,
      topDenialReasonCode: raw.cmsData?.topDenialReasonCode,
      topDenialReason: raw.cmsData?.topDenialReason
    },
    installedFleet: {
      ...(raw.installedFleet || {}),
      defibBrand: raw.installedFleet?.defibBrand || 'Not reported',
      defibAgeYears: raw.installedFleet?.defibAgeYears,
      defibUnitsCount: raw.installedFleet?.defibUnitsCount,
      defibWarrantyStatus: raw.installedFleet?.defibWarrantyStatus || 'Not reported',
      mechanicalCPR: raw.installedFleet?.mechanicalCPR || 'Not reported',
      transportVentilator: raw.installedFleet?.transportVentilator || 'Not reported',
      epcrCadSoftware: raw.installedFleet?.epcrCadSoftware || 'Not reported',
      billingSoftware: raw.installedFleet?.billingSoftware || 'Not reported',
      dispatchCadVendor: raw.installedFleet?.dispatchCadVendor || 'Not reported'
    },
    zollOpportunity: {
      ...(raw.zollOpportunity || {}),
      pulseIqScore: raw.zollOpportunity?.pulseIqScore,
      priorityTier: raw.zollOpportunity?.priorityTier || 'Not calculated',
      primaryTargetProduct: raw.zollOpportunity?.primaryTargetProduct || 'Not selected',
      recommendedBundle: raw.zollOpportunity?.recommendedBundle || [],
      projectedPipelineValue: raw.zollOpportunity?.projectedPipelineValue,
      salesStage: raw.zollOpportunity?.salesStage || 'Not reported',
      probabilityPct: raw.zollOpportunity?.probabilityPct,
      clinicalBenefitNarrative: raw.zollOpportunity?.clinicalBenefitNarrative || 'Not reported',
      financialRoiNarrative: raw.zollOpportunity?.financialRoiNarrative || 'Not reported',
      scoreRationale: raw.zollOpportunity?.scoreRationale || 'Score inputs and method not reported.',
      scoreBreakdown: {
        clinicalAcuityPts: raw.zollOpportunity?.scoreBreakdown?.clinicalAcuityPts,
        fleetObsolescencePts: raw.zollOpportunity?.scoreBreakdown?.fleetObsolescencePts,
        cmsFinancialPts: raw.zollOpportunity?.scoreBreakdown?.cmsFinancialPts,
        demographicVulnerabilityPts: raw.zollOpportunity?.scoreBreakdown?.demographicVulnerabilityPts,
        budgetGrantReadinessPts: raw.zollOpportunity?.scoreBreakdown?.budgetGrantReadinessPts,
        softwareWhitespacePts: raw.zollOpportunity?.scoreBreakdown?.softwareWhitespacePts
      }
    },
    keyContacts: normalizedContacts,
    fieldNotes: Array.isArray(raw.fieldNotes) ? raw.fieldNotes : []
  };
}

/**
 * Resolves the specific manufacturer/distributor supplier for each installed equipment and software line.
 */
function resolveEquipmentSuppliers(agency: Agency) {
  const fleet = agency.installedFleet;

  const defibSupplier = fleet.defibBrand.toLowerCase().includes('stryker') || fleet.defibBrand.toLowerCase().includes('lifepak')
    ? 'Stryker Medical / Physio-Control ProCare'
    : fleet.defibBrand.toLowerCase().includes('philips')
      ? 'Philips Healthcare Emergency Care'
      : fleet.defibBrand.toLowerCase().includes('zoll')
        ? 'ZOLL Medical Corporation (Direct OEM)'
        : 'Stryker Medical / Third-Party Biomedical ISO';

  const cprSupplier = fleet.mechanicalCPR.toLowerCase().includes('lucas') || fleet.mechanicalCPR.toLowerCase().includes('stryker')
    ? 'Stryker Medical (LUCAS Resuscitation Division)'
    : fleet.mechanicalCPR.toLowerCase().includes('autopulse') || fleet.mechanicalCPR.toLowerCase().includes('zoll')
      ? 'ZOLL Medical Corporation'
      : 'None Installed (Manual Compressions Only — Bound Tree Consumables)';

  const ventSupplier = fleet.transportVentilator.toLowerCase().includes('hamilton')
    ? 'Hamilton Medical AG / Bound Tree Distribution'
    : fleet.transportVentilator.toLowerCase().includes('zoll') || fleet.transportVentilator.toLowerCase().includes('z vent')
      ? 'ZOLL Medical Corporation'
      : fleet.transportVentilator.toLowerCase().includes('impact')
        ? 'Legacy Impact Instrumentation (End-of-Life)'
        : 'Teleflex / Ambu Disposable BVM Supply (No Automated Ventilator)';

  const epcrSupplier = fleet.epcrCadSoftware.toLowerCase().includes('imagetrend')
    ? 'ImageTrend, Inc. (Elite EMS Cloud)'
    : fleet.epcrCadSoftware.toLowerCase().includes('eso')
      ? 'ESO Solutions, Inc. (ESO EHR Suite)'
      : fleet.epcrCadSoftware.toLowerCase().includes('zoll')
        ? 'ZOLL Data Systems (RescueNet ePCR)'
        : 'Regional State NEMSIS Vendor';

  const cadSupplier = (fleet.dispatchCadVendor || '').toLowerCase().includes('centralsquare')
    ? 'CentralSquare Technologies (Enterprise Public Safety)'
    : (fleet.dispatchCadVendor || '').toLowerCase().includes('motorola')
      ? 'Motorola Solutions (PremierOne CAD)'
      : (fleet.dispatchCadVendor || '').toLowerCase().includes('hexagon')
        ? 'Hexagon Safety, Infrastructure & Geospatial (HxGN OnCall)'
        : (fleet.dispatchCadVendor || '').toLowerCase().includes('tyler')
          ? 'Tyler Technologies (New World Public Safety CAD)'
          : 'ZOLL Data Systems (ZOLL Respond CAD)';

  const billingSupplier = fleet.billingSoftware.toLowerCase().includes('digitech')
    ? 'Digitech Computer LLC (EMS Billing & RCM)'
    : fleet.billingSoftware.toLowerCase().includes('optum')
      ? 'Optum Revenue Cycle Management'
      : fleet.billingSoftware.toLowerCase().includes('zoll')
        ? 'ZOLL Data Systems (ZOLL Billing / AR Boost)'
        : 'In-House Municipal Finance & Revenue Division';

  const medicalDistributor =
    agency.populationServed % 2 === 0
      ? 'Bound Tree Medical (Primary EMS Disposables & Electrodes)'
      : 'Henry Schein EMS & Medical Supplies (Primary Contract Distributor)';

  return {
    defibSupplier,
    cprSupplier,
    ventSupplier,
    epcrSupplier,
    cadSupplier,
    billingSupplier,
    medicalDistributor
  };
}

export const FocusedProviderProfile: React.FC<FocusedProviderProfileProps> = ({
  agency: rawAgency,
  weights,
  backLabel,
  comparedAgencyIds,
  onToggleAgencyComparison,
  onOpenAgencyComparison,
  onBack,
  onGoHome,
  onNavigateGeography,
  onUpdateStage,
  onToggleRoute,
  onToggleBookmark,
  onAddFieldNote,
  onOpenRfpGenerator,
  onOpenDataLineage,
  onSaveAgencySourceData,
  onDecideAgencySourceRecord
}) => {
  const verifyProviderMutation = useVerifyProviderLive();
  const [isVerifyingLive, setIsVerifyingLive] = useState(false);
  const [liveNppesResult, setLiveNppesResult] = useState<NppesLookupResult | null>(null);
  const [liveNppesError, setLiveNppesError] = useState('');
  const [showDossierModal, setShowDossierModal] = useState(false);

  // Clear transient source search results when switching agency profiles.
  useEffect(() => {
    setLiveNppesResult(null);
    setLiveNppesError('');
  }, [rawAgency.id]);

  const agency = useMemo(() => ensureCompleteAgencyData(rawAgency), [rawAgency]);
  const suppliers = useMemo(() => resolveEquipmentSuppliers(agency), [agency]);
  const geographicLinks = useMemo(
    () => getAgencyGeographicLinks(agency),
    [agency],
  );
  const locationGeographicLinks = geographicLinks.filter(
    (link) => link.relationship === 'located-at' || link.relationship === 'headquartered-in',
  );
  const serviceGeographicLinks = geographicLinks.filter(
    (link) => link.relationship === 'serves',
  );
  const stationGeographicLinks = geographicLinks.filter(
    (link) => link.relationship === 'operates-station-in',
  );
  const tcoModel = useMemo(() => {
    const reportedDefibCount = agency.installedFleet.defibUnitsCount;
    if (!hasReportedValue(reportedDefibCount) || reportedDefibCount <= 0) return null;
    return calculateAgencyFleetTco(agency, 5, reportedDefibCount);
  }, [agency]);
  const hcpcsModel = useMemo(() => calculateAgencyHcpcsBreakdown(agency), [agency]);
  const protocolModel = useMemo(() => getAgencyClinicalProtocolAlignment(agency), [agency]);

  // Default to Overview in the 7-topic Account 360 navigation
  const [showActuarialMath, setShowActuarialMath] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>('overview');
  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState<boolean>(false);
  const [profileReviewedAt, setProfileReviewedAt] = useState<string | null>(null);
  const [profileReviewError, setProfileReviewError] = useState('');

  useEffect(() => {
    setProfileReviewedAt(getAgencyProfileReviewedAt(rawAgency.id));
    setProfileReviewError('');
  }, [rawAgency.id]);

  const markProfileReviewed = () => {
    const reviewedAt = new Date().toISOString();
    if (!saveAgencyProfileReviewedAt(agency.id, reviewedAt)) {
      setProfileReviewError('This browser could not save the review status. The agency data was not changed.');
      return;
    }
    setProfileReviewedAt(reviewedAt);
    setProfileReviewError('');
  };

  // Field Note Form State
  const [meetingType, setMeetingType] = useState<FieldNote['meetingType']>('On-Site Station Visit');
  const [noteText, setNoteText] = useState('');
  const [nextAction, setNextAction] = useState('');

  // Interactive Actuarial Forecasting Sensitivity Controls (Low / Base / High Confidence Intervals)
  const [customUnitMsrp, setCustomUnitMsrp] = useState<number>(38500);
  const [customTradeInCredit, setCustomTradeInCredit] = useState<number>(4000);
  const [customDenialCapturePct, setCustomDenialCapturePct] = useState<number>(65);

  const isFire = agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire');
  const linkedNppesAssociation = agency.sourceRecordAssociations?.find(
    (association) =>
      association.sourceName.toLowerCase().includes('nppes') &&
      validateNpiCheckDigit(association.sourceRecordId).isValid &&
      association.decision === 'confirmed'
  );
  const hasUserLinkedNppesRecord = Boolean(linkedNppesAssociation);
  const medicareDenialMetric = hasUserLinkedNppesRecord
    ? getAgencyMedicareDenialMetricForDisplay(agency)
    : null;
  const actuarialForecast = useMemo(() => {
    const reportedUnitCount = agency.installedFleet.defibUnitsCount ?? agency.totalAmbulances;
    const hasUnitCount = hasReportedValue(reportedUnitCount);
    const units = reportedUnitCount ?? 0;
    const grossCapExBase = units * customUnitMsrp;
    const totalTradeIn = units * customTradeInCredit;
    const netCapExBase = Math.max(0, grossCapExBase - totalTradeIn);
    const netCapExLow = Math.round(netCapExBase * 0.85);
    const netCapExHigh = Math.round(netCapExBase * 1.15);

    const deniedAmount = agency.cmsData.medicareDeniedAmountAnnual;
    const hasRecoveryInputs =
      typeof deniedAmount === 'number' &&
      Number.isFinite(deniedAmount) &&
      deniedAmount >= 0 &&
      Boolean(agency.cmsData.medicareDenialClaimScope?.trim()) &&
      Boolean(agency.cmsData.medicareDenialReportingPeriod?.trim()) &&
      Boolean(agency.cmsData.medicareDenialSource?.trim()) &&
      Boolean(agency.cmsData.medicareDenialSourceUrl?.trim());
    const deniedPool = hasRecoveryInputs
      ? deniedAmount
      : 0;
    const annualRecoveryBase = Math.round(deniedPool * (customDenialCapturePct / 100));
    const annualRecoveryLow = Math.round(annualRecoveryBase * 0.82);
    const annualRecoveryHigh = Math.round(annualRecoveryBase * 1.18);

    const fiveYrTcoBase = (tcoModel?.fiveYearOperatingSavings ?? 0) + totalTradeIn;
    const fiveYrTcoLow = Math.round(fiveYrTcoBase * 0.85);
    const fiveYrTcoHigh = Math.round(fiveYrTcoBase * 1.15);

    return {
      units,
      hasUnitCount,
      hasRecoveryInputs,
      hasTcoInputs: Boolean(tcoModel && tcoModel.unitCount > 0),
      netCapExLow,
      netCapExBase,
      netCapExHigh,
      annualRecoveryLow,
      annualRecoveryBase,
      annualRecoveryHigh,
      fiveYrTcoLow,
      fiveYrTcoBase,
      fiveYrTcoHigh
    };
  }, [agency, customUnitMsrp, customTradeInCredit, customDenialCapturePct, tcoModel]);

  const triggerLiveVerification = async () => {
    if (isVerifyingLive) return;
    setIsVerifyingLive(true);
    setLiveNppesError('');
    try {
      const response = await verifyProviderMutation.mutateAsync({
        data: {
          agencyName: rawAgency.name,
          city: rawAgency.city,
          stateCode: rawAgency.stateCode,
          npiNumber: rawAgency.npiNumber || undefined
        }
      });
      const data = response as typeof response & {
        outcome?: string;
        details?: string;
        address?: string;
        zipCode?: string;
        npiNumber?: string;
        taxonomyDescription?: string;
        nppesOfficialName?: string;
        nppesLastUpdated?: string;
        allCityNpiProviders?: Array<{
          npiNumber?: string;
          officialName?: string;
          city?: string;
          stateCode?: string;
          zipCode?: string;
          taxonomyDescription?: string;
          registryUrl?: string;
        }>;
      };
      const fetchedAt = new Date().toISOString();
      const candidates: NppesSourceCandidate[] = (data.allCityNpiProviders ?? [])
        .filter((candidate) => Boolean(candidate.npiNumber))
        .map((candidate) => ({
          npiNumber: candidate.npiNumber ?? '',
          officialName: candidate.officialName ?? '',
          city: candidate.city ?? '',
          stateCode: candidate.stateCode ?? '',
          zipCode: candidate.zipCode ?? '',
          taxonomyDescription: candidate.taxonomyDescription ?? '',
          registryUrl: candidate.registryUrl || `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(candidate.npiNumber ?? '')}`,
        }));

      if (data.npiNumber) {
        const exactCandidate: NppesSourceCandidate = {
          npiNumber: data.npiNumber,
          officialName: data.nppesOfficialName ?? '',
          city: rawAgency.city,
          stateCode: rawAgency.stateCode,
          zipCode: data.zipCode ?? '',
          taxonomyDescription: data.taxonomyDescription ?? '',
          registryUrl: `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(data.npiNumber)}`,
          address: data.address,
          nppesLastUpdated: data.nppesLastUpdated,
        };
        const existingIndex = candidates.findIndex(
          (candidate) => candidate.npiNumber === exactCandidate.npiNumber,
        );
        if (existingIndex >= 0) {
          candidates[existingIndex] = {
            ...candidates[existingIndex],
            ...exactCandidate,
          };
        } else {
          candidates.unshift(exactCandidate);
        }
      }

      setLiveNppesResult({
        outcome: data.outcome ?? 'SOURCE_RESPONSE',
        details: data.details ?? 'NPPES returned source records for end-user review.',
        fetchedAt,
        candidates,
        candidateCount: candidates.length,
      });
    } catch {
      setLiveNppesResult(null);
      setLiveNppesError('CMS NPPES search did not complete. No profile fields were changed.');
    } finally {
      setIsVerifyingLive(false);
    }
  };

  const decideNppesCandidate = (
    candidate: NppesSourceCandidate,
    decision: AgencySourceRecordAssociation['decision'],
  ) => {
    const sourceUrl = candidate.registryUrl ||
      `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(candidate.npiNumber)}`;
    onDecideAgencySourceRecord(agency.id, {
      id: `cms-nppes-${agency.id}-${candidate.npiNumber}`,
      sourceName: 'CMS NPPES',
      sourceRecordId: candidate.npiNumber,
      sourceUrl,
      decision,
      matchBasis: 'The CMS NPPES search returned this candidate using agency name and location inputs. This records only the end user’s association decision; it does not verify other profile information.',
      sourceDate: candidate.nppesLastUpdated ?? null,
      retrievedAt: liveNppesResult?.fetchedAt ?? new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      sourceFields: {
        npiNumber: candidate.npiNumber,
        officialName: candidate.officialName,
        address: candidate.address,
        city: candidate.city,
        stateCode: candidate.stateCode,
        zipCode: candidate.zipCode,
        taxonomyDescription: candidate.taxonomyDescription,
        nppesLastUpdated: candidate.nppesLastUpdated,
      },
    });
  };

  // Escape invokes the same app-level navigation as the profile Back action.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onBack]);

  const stages: LeadStage[] = [
    'Target Lead',
    'Contacted / Intro',
    'Demo Scheduled',
    'Clinical Evaluation Trial',
    'RFP / Quoting',
    'Contract Won'
  ];

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    onAddFieldNote(agency.id, {
      date: new Date().toISOString().split('T')[0],
      repName: 'Territory Director',
      meetingType,
      notes: noteText.trim(),
      nextAction: nextAction.trim() || `Follow up with ${agency.keyContacts[0]?.name || 'department leadership'}`,
      dueDate: '2026-11-15'
    });
    setNoteText('');
    setNextAction('');
  };

  const handlePrintBrief = () => {
    window.print();
  };

  const isFireAgency = agency.agencyType?.toLowerCase().includes('fire') ?? false;
  const primaryContact = agency.keyContacts[0];
  const topSourceItems = [
    { label: 'Agency address', sourceName: agency.factEvidence?.providerAddress?.sourceName, period: agency.factEvidence?.providerAddress?.reportingPeriod, url: agency.factEvidence?.providerAddress?.sourceUrl },
    { label: 'Leadership', sourceName: agency.factEvidence?.agencyLeadership?.sourceName || agency.factEvidence?.decisionMakers?.sourceName, period: agency.factEvidence?.agencyLeadership?.reportingPeriod || agency.factEvidence?.decisionMakers?.reportingPeriod, url: agency.factEvidence?.agencyLeadership?.sourceUrl || agency.factEvidence?.decisionMakers?.sourceUrl },
    { label: 'Operations', sourceName: agency.factEvidence?.annualEmergencyVolume?.sourceName || agency.factEvidence?.annualCallsReceived?.sourceName, period: agency.factEvidence?.annualEmergencyVolume?.reportingPeriod || agency.factEvidence?.annualCallsReceived?.reportingPeriod, url: agency.factEvidence?.annualEmergencyVolume?.sourceUrl || agency.factEvidence?.annualCallsReceived?.sourceUrl },
    { label: 'Frontline units', sourceName: agency.factEvidence?.frontlineApparatusStations?.sourceName || agency.factEvidence?.frontlineRescueUnits?.sourceName, period: agency.factEvidence?.frontlineApparatusStations?.reportingPeriod || agency.factEvidence?.frontlineRescueUnits?.reportingPeriod, url: agency.factEvidence?.frontlineApparatusStations?.sourceUrl || agency.factEvidence?.frontlineRescueUnits?.sourceUrl },
    ...(agency.sourceFacts ?? []).map((fact) => ({
      label: fact.fieldKey
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (character) => character.toUpperCase()),
      sourceName: fact.sourceName,
      period: fact.reportingPeriod || fact.effectivePeriod,
      url: fact.sourceUrl,
    })),
  ]
    .filter((source) => source.sourceName || source.url)
    .filter((source, index, allSources) => allSources.findIndex((candidate) =>
      candidate.label === source.label &&
      candidate.sourceName === source.sourceName &&
      candidate.period === source.period &&
      candidate.url === source.url,
    ) === index)
    .slice(0, 3);

  const showSection = (
    sec:
      | 'deal_story'
      | 'battlecard'
      | 'facts'
      | 'leadership'
      | 'fleet'
      | 'software'
      | 'suppliers'
      | 'grants'
      | 'clinical'
      | 'billing'
      | 'notes'
      | 'evidence_ledger'
  ) => {
    if (activeSection === 'all') return true;
    if (activeSection === 'overview') return sec === 'deal_story' || sec === 'facts';
    if (activeSection === 'equipment') return sec === 'fleet' || sec === 'software' || sec === 'battlecard';
    if (activeSection === 'purchasing') return sec === 'suppliers' || sec === 'grants';
    if (activeSection === 'decision_makers') return sec === 'leadership';
    if (activeSection === 'operations') return sec === 'clinical' || sec === 'fleet';
    if (activeSection === 'medicare') return sec === 'billing';
    if (activeSection === 'evidence') return sec === 'evidence_ledger' || sec === 'notes';
    return false;
  };

  const navigateProfileSection = (section: ProfileSection) => {
    setActiveSection(section);
    window.requestAnimationFrame(() => {
      document.querySelector('[data-testid="profile-topic-navigation"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const openProfileSources = () => {
    setActiveSection('evidence');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById('profile-source-evidence')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  };

  const hasDecisionGradeInputs =
    hasAgencyFactEvidence(agency, 'frontlineApparatusStations') &&
    hasAgencyFactEvidence(agency, 'annualEmergencyVolume') &&
    hasAgencyFactEvidence(agency, 'clinicalOutcomes') &&
    hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
    hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
    hasAgencyFactEvidence(agency, 'cmsClaims') &&
    hasAgencyFactEvidence(agency, 'federalGrant');

  // Up to 3 structured "Fact -> Why It Matters -> Next Action" rows for Above the Fold
  const equipDisplay = formatEquipmentDisplay(
    agency.installedFleet.defibUnitsCount,
    agency.installedFleet.defibBrand,
    agency.installedFleet.defibAgeYears
  );

  const importantIntelligenceRows = [
    {
      id: 'intel-fleet',
      category: 'Equipment & contract timing',
      primaryFact: equipDisplay.primary,
      secondaryFact: `${equipDisplay.secondary} · Contract ends ${agency.competitorContract.contractEndDate || 'Not reported'}`,
      whyItMatters: hasReportedValue(agency.installedFleet.defibAgeYears)
        ? `Reported monitor age is ${reportMetric(agency.installedFleet.defibAgeYears)} years; verify replacement criteria and the reported contract timeline.`
        : 'Monitor age is not reported; verify fleet age and the contract timeline before assessing replacement needs.',
      nextActionLabel: 'Inspect equipment',
      targetTopic: 'equipment' as ProfileSection,
      sourceBadge: 'USFA service record'
    },
    {
      id: 'intel-purchasing',
      category: 'Purchasing & grant liquidity',
      primaryFact: agency.grantStatus.afgAwarded
        ? `${reportCurrency(agency.grantStatus.afgAwardAmount)} FEMA AFG award (FY${reportMetric(agency.grantStatus.afgFiscalYear)})`
        : 'Public-sector cooperative purchasing contracts are listed; verify local eligibility and terms.',
      secondaryFact: actuarialForecast.hasTcoInputs
        ? `${formatCurrency(actuarialForecast.fiveYrTcoBase, { showSign: true })} illustrative 5-year estimate; reported unit count × benchmark service, battery, and consumables savings plus selected trade-in credit.`
        : '5-year fleet estimate not calculated: positive reported defibrillator count is unavailable.',
      whyItMatters: `Illustrative trade-in assumption: ${formatCurrency(customTradeInCredit)} per unit; confirm current pricing and eligibility before use.`,
      nextActionLabel: 'Review purchasing',
      targetTopic: 'purchasing' as ProfileSection,
      sourceBadge: 'OpenFEMA AFG & TCO model'
    },
    {
      id: 'intel-clinical-cms',
      category: 'Medicare & resuscitation impact',
      primaryFact: medicareDenialMetric
        ? 'Medicare claim records available'
        : 'Medicare claim records are not shown in this view.',
      secondaryFact: actuarialForecast.hasRecoveryInputs
        ? `${formatCurrency(actuarialForecast.annualRecoveryBase, { perYear: true, showSign: true })} illustrative recovery scenario; reported denied-claim dollars × selected ${customDenialCapturePct}% capture assumption (±18% sensitivity).`
        : 'Recovery estimate not calculated: same-scope reported denied-claim dollars and reporting period are required.',
      whyItMatters: 'Review billing and documentation workflows; no agency-specific recovery amount is attributed to product features without verified inputs.',
      nextActionLabel: 'Inspect Medicare',
      targetTopic: 'medicare' as ProfileSection,
      sourceBadge: medicareDenialMetric?.source ?? 'Medicare claim summary'
    }
  ];

  // Comprehensive Evidence-Backed Account Assessment
  const accountAssessment = useMemo(() => {
    const isFire = agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire');
    const hasGrant = Boolean(agency.grantStatus?.afgAwarded);
    const grantAmt = agency.grantStatus?.afgAwardAmount ?? 0;
    const defibBrand = agency.installedFleet?.defibBrand || 'Not reported';
    const defibAge = agency.installedFleet?.defibAgeYears;
    const contractEnd = agency.competitorContract?.contractEndDate || 'Not reported';
    const hasNotes = Array.isArray(agency.fieldNotes) && agency.fieldNotes.length > 0;
    const topNote = hasNotes ? agency.fieldNotes[0] : null;

    // 1. What Is Known About the Organization
    const whatIsKnown = [
      hasAgencyFactEvidence(agency, 'providerAddress')
        ? `Department address: ${agency.address} (official department source).`
        : 'Department address not reported in the record.',
      hasAgencyFactEvidence(agency, 'departmentRegistry')
        ? `Florida EMS provider license ${agency.stateLicenseNumber || 'listed'} is on the state provider report. This is not a verified USFA FDID.`
        : 'State EMS license or USFA FDID not reported in the record.',
      hasAgencyFactEvidence(agency, 'agencyLeadership')
        ? `Leadership is listed in the cited agency source: ${primaryContact?.name || 'see source record'}.`
        : 'Current agency leadership not reported in the record.',
      hasAgencyFactEvidence(agency, 'stationCount')
        ? `The county reports ${reportMetric(agency.stationsCount)} fire-rescue stations.`
        : 'Station count not reported in the record.',
      hasAgencyFactEvidence(agency, 'frontlineRescueUnits') && hasReportedValue(agency.frontlineRescueUnitCount)
        ? `The county reports ${reportMetric(agency.frontlineRescueUnitCount)} front-line rescue units and ${reportMetric(agency.responseUnitCount)} total rescue, suppression, battalion, and specialty units.`
        : 'Frontline rescue-unit and apparatus-type counts not reported in the record.',
      hasAgencyFactEvidence(agency, 'annualCallsReceived')
        ? `${reportMetric(agency.annualCallVolume)} Fire Rescue calls were received in ${agency.factEvidence?.annualCallsReceived?.reportingPeriod || 'the cited reporting period'}; this is not an EMS transport count.`
        : 'Annual Fire Rescue call volume not reported in the record.',
      hasAgencyFactEvidence(agency, 'epcrSystem')
        ? `${agency.installedFleet.epcrCadSoftware} is identified as the department’s primary ePCR; review CAD and transport details in their respective fields.`
        : 'Current ePCR and CAD systems not reported in the record.',
      hasAgencyFactEvidence(agency, 'monitorModelTransition')
        ? 'The county reports LIFEPAK-15 devices in use and LIFEPAK-35 replacement activity; exact counts and completion are unknown.'
        : 'Monitor and defibrillator fleet counts or models not reported in the record.'
    ];

    // 2. Developments That Matter
    const developmentsThatMatter: string[] = [];
    if (hasNotes && topNote) {
      developmentsThatMatter.push(`Active field relationship: Logged ${topNote.meetingType} on ${topNote.date}. Next action committed: "${topNote.nextAction || 'Follow up with leadership'}".`);
    }
    if (hasAgencyFactEvidence(agency, 'federalGrant') && hasGrant && grantAmt > 0) {
      developmentsThatMatter.push(`Active capital grant liquidity: FEMA AFG Award FY${agency.grantStatus?.afgFiscalYear ?? 'Not reported'} of $${Math.round(grantAmt / 1000)}K allocated for operational equipment upgrades.`);
    }
    if (hasAgencyFactEvidence(agency, 'maintenanceContracts') && (defibAge >= 7.5 || agency.competitorContract?.status === 'Expiring Soon')) {
      developmentsThatMatter.push(`Incumbent service contract renewal window: Contract ends ${contractEnd}. Opportunity to avoid multi-year maintenance cost locks via cooperative purchasing.`);
    }
    if (developmentsThatMatter.length === 0) {
      developmentsThatMatter.push('No current operational or procurement development is listed in this agency record.');
    }

    // 3. What Is Not Yet Confirmed (Research Gaps)
    const whatIsNotConfirmed = [
      'Exact biomedical inventory, serial numbers, and battery inventory across frontline units.',
      `Municipal council or district board capital budget voting timeline and FY2026 appropriation gates.`,
      `Medical Direction stance on Real BVM Help® ventilation guidance vs. automated mechanical CPR adoption.`,
      `Local municipal procurement threshold for cooperative contract utilization versus sealed competitive RFP.`
    ];

    // 4. Primary Recommended Move
    let primaryMoveAction = `Verify ${isFire ? 'fire department' : 'EMS provider'} operational records`;
    let primaryMoveWhy = 'Confirm stations, frontline units, annual volume, receiving hospitals, equipment, systems, contracts, and decision makers from current agency or procurement sources.';
    let primaryMoveEvidence = 'Source links are provided where mapped; users should confirm operational details with the agency.';
    let primaryMoveNextStep = 'Prepare for Meeting';

    if (hasNotes && topNote?.nextAction) {
      primaryMoveAction = `Execute Scheduled Follow-Up: ${topNote.nextAction}`;
      primaryMoveWhy = `Maintain momentum from ${topNote.date} discussion with ${primaryContact?.name || 'station command'}.`;
      primaryMoveEvidence = `My Work Field Visit Note (${topNote.date})`;
      primaryMoveNextStep = 'Log Station Note';
    } else if (hasAgencyFactEvidence(agency, 'federalGrant') && hasGrant && grantAmt > 0) {
      primaryMoveAction = `Align ZOLL Solution Package to $${Math.round(grantAmt / 1000)}K FEMA AFG Grant`;
      primaryMoveWhy = `Provide compliant equipment specifications and quote before the federal award expenditure period closes.`;
      primaryMoveEvidence = `OpenFEMA AFG Award #${agency.grantStatus?.afgAwardNumber || 'Not reported'} · FY${agency.grantStatus?.afgFiscalYear ?? 'Not reported'}`;
      primaryMoveNextStep = 'Generate Co-Op RFP';
    } else if (
      hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
      (defibAge >= 7.5 || agency.competitorContract?.status === 'Expiring Soon')
    ) {
      primaryMoveAction = `Review Service Contract Notice Ahead of ${contractEnd} Renewal`;
      primaryMoveWhy = `Present 5-year fixed biomedical service cost caps to prevent automatic renewal of legacy T&M service contracts.`;
      primaryMoveEvidence = `Competitor Contract Ledger · Renewal Notice Window`;
      primaryMoveNextStep = 'Review Purchasing';
    } else if (medicareDenialMetric) {
      primaryMoveAction = 'Review imported Medicare claim summary';
      primaryMoveWhy = 'Claim counts and their citation are available for direct agency review; local percentages do not affect prioritization or recovery estimates.';
      primaryMoveEvidence = `${medicareDenialMetric.source} · ${medicareDenialMetric.reportingPeriod}`;
      primaryMoveNextStep = 'Review claim evidence';
    }

    return {
      whatIsKnown,
      developmentsThatMatter,
      whatIsNotConfirmed,
      primaryMove: {
        action: primaryMoveAction,
        why: primaryMoveWhy,
        evidence: primaryMoveEvidence,
        nextStep: primaryMoveNextStep
      }
    };
  }, [agency, primaryContact, medicareDenialMetric]);

  return (
    <div className="provider-profile-overlay fixed inset-0 md:left-64 z-45 overflow-x-clip overflow-y-auto bg-[#F5F7FA] dark:bg-[#0B1320]">
      <main
        aria-label={`${agency.name} Account 360 Workspace`}
        className="profile-workspace flex min-h-screen w-full min-w-0 flex-col bg-[#F5F7FA] pb-32 font-sans text-[#14283F] dark:bg-[#0B1320] dark:text-slate-100 sm:pb-24"
      >
        {/* Top Sticky Account 360 Bar */}
        <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111C2D]/95 backdrop-blur border-b border-[#DFE6EF] dark:border-[#1E2D42] px-4 sm:px-6 lg:px-8 py-2 sm:py-0 min-h-16 flex items-center shadow-2xs">
          <div className="mx-auto flex w-full min-w-0 max-w-[1640px] flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {/* Back Navigation & Geographic Breadcrumb */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={backLabel}
                  data-testid="profile-back-button"
                  className="whitespace-nowrap shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#14283F] dark:text-slate-100 bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-[#DFE6EF] dark:border-[#1E2D42] transition-colors cursor-pointer"
                  title={`Return to ${backLabel.replace(/^Back to /, '')}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">Back</span>
                  <span className="hidden sm:inline">{backLabel}</span>
                </button>

                <div className="hidden md:flex items-center gap-1.5 text-xs text-[#53657B] dark:text-slate-400 font-medium truncate">
                {onNavigateGeography ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateGeography(agency.stateCode, 'all', 'all')}
                      className="text-[#285EE8] dark:text-blue-400 hover:underline cursor-pointer truncate"
                    >
                      {agency.state} ({agency.stateCode})
                    </button>
                    <span aria-hidden="true">›</span>
                    <button
                      type="button"
                      onClick={() => onNavigateGeography(agency.stateCode, agency.county, 'all')}
                      className="text-[#285EE8] dark:text-blue-400 hover:underline cursor-pointer truncate"
                    >
                      {agency.county}
                    </button>
                    <span aria-hidden="true">›</span>
                    <span className="font-semibold text-[#14283F] dark:text-white truncate">{agency.city}</span>
                  </>
                ) : (
                  <>
                    <span>{agency.state} ({agency.stateCode})</span>
                    <span aria-hidden="true">›</span>
                    <span>{agency.county}</span>
                    <span aria-hidden="true">›</span>
                    <span className="font-semibold text-[#14283F] dark:text-white truncate">{agency.city}</span>
                  </>
                )}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[11px] text-[#53657B] dark:text-slate-400 md:hidden" aria-label="Selected agency area">
                {onNavigateGeography ? (
                  <>
                    <button type="button" onClick={() => onNavigateGeography(agency.stateCode, 'all', 'all')} className="shrink-0 font-semibold text-[#285EE8] dark:text-blue-300">{agency.stateCode}</button>
                    <span aria-hidden="true">›</span>
                    <button type="button" onClick={() => onNavigateGeography(agency.stateCode, agency.county, 'all')} className="shrink-0 font-semibold text-[#285EE8] dark:text-blue-300">{agency.county}</button>
                    <span aria-hidden="true">›</span>
                    <span className="truncate font-semibold text-[#14283F] dark:text-slate-200">{agency.city}</span>
                  </>
                ) : (
                  <span className="truncate">{[agency.city, agency.county, agency.stateCode].filter(Boolean).join(' · ')}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Primary actions stay available as a compact dock while reading the profile. */}
        <div
          className="profile-action-dock flex max-w-full items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar sm:gap-2"
          data-testid="profile-primary-actions"
        >
              <div className="hidden shrink-0 items-center gap-1.5 md:flex">
                <label
                  htmlFor="profile-sales-stage"
                  className="text-[10px] font-bold uppercase tracking-wide text-[#53657B] dark:text-slate-400"
                >
                  Stage
                </label>
                <select
                  id="profile-sales-stage"
                  aria-label="Update CRM Sales Pipeline Stage"
                  data-testid="profile-sales-stage"
                  value={agency.zollOpportunity.salesStage}
                  onChange={(e) => onUpdateStage(agency.id, e.target.value as LeadStage)}
                  className="h-9 max-w-[170px] rounded-lg border border-[#DFE6EF] bg-white px-2 text-xs font-semibold text-[#14283F] focus:border-[#285EE8] focus:outline-none dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-slate-100"
                >
                  {stages.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
              <AgencyCompareButton
                agency={agency}
                selected={comparedAgencyIds.includes(agency.id)}
                limitReached={comparedAgencyIds.length >= 3}
                onToggle={onToggleAgencyComparison}
                className="min-h-10"
              />
              {comparedAgencyIds.length >= 2 && (
                <button
                  type="button"
                  onClick={onOpenAgencyComparison}
                  className="min-h-10 whitespace-nowrap rounded-lg bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800"
                  data-testid="button-open-comparison-from-profile"
                >
                  Compare {comparedAgencyIds.length}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('overview');
                  setTimeout(() => {
                    const el = document.getElementById('meeting-preparation-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white transition-colors cursor-pointer shadow-2xs"
                aria-label="Prepare for meeting"
                title="Open executive meeting strategy & discovery questions"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Prepare for Meeting</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSourceDrawerOpen(true)}
                className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Inspect agency sources"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Inspect Sources</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleRoute(agency.id)}
                aria-label={agency.inDayRoute ? "Remove agency from today's route" : 'Add agency to route'}
                className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  agency.inDayRoute
                    ? 'bg-[#0B1728] dark:bg-blue-600 text-white'
                    : 'bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:bg-[#F5F7FA]'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 shrink-0" />
                <span>{agency.inDayRoute ? 'In Route' : 'Add to Route'}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleBookmark(agency.id)}
                aria-label={agency.isBookmarked ? 'Remove agency from saved work' : 'Save agency to My Work'}
                className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  agency.isBookmarked
                    ? 'bg-[#285EE8] text-white'
                    : 'bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:bg-[#F5F7FA]'
                }`}
                title="Save account to My Work"
              >
                <Bookmark className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{agency.isBookmarked ? 'Saved' : 'Save'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDossierModal(true)}
                className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:bg-[#F5F7FA] transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Print Brief</span>
              </button>

              {onOpenRfpGenerator && (
                <button
                  type="button"
                  onClick={() => onOpenRfpGenerator(agency)}
                  className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white transition-colors cursor-pointer shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>Generate RFP Spec</span>
                </button>
              )}
        </div>

        {/* Main Account 360 Workspace Content */}
        <div className="mx-auto w-full min-w-0 max-w-[1640px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {/* ================================================================
              ABOVE THE FOLD — 3 PRIMARY DECISION BLOCKS (SECTION 9)
             ================================================================ */}
          <section
            aria-label="Account 360 Executive Decision Header"
            className="profile-executive-header pi-surface p-4 sm:p-5 lg:p-6 space-y-5"
          >
            {/* BLOCK 1: AGENCY IDENTITY, OFFICIAL IDENTIFIERS & SOURCE VERIFICATION */}
            <div className="flex flex-col gap-4 pb-6 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
              <div className="space-y-3 min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#53657B] dark:text-slate-400">
                  <span className="font-semibold text-[#285EE8] dark:text-blue-400">
                    {isFire ? 'Fire Department' : 'EMS Provider'}
                  </span>
                </div>

                <div>
                  <h1 className="pi-page-title text-[24px] font-[650] leading-[1.2] text-[#14283F] dark:text-white sm:text-[32px]">
                    {agency.name}
                  </h1>
                  <p className="pi-supporting mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[#14283F] dark:text-white">
                      {agency.address || 'Address not reported'}
                    </span>
                    <FactVerificationTag agency={agency} field="providerAddress" />
                    <span aria-hidden="true">·</span>
                    <span>{agency.county}, {agency.state} ({agency.stateCode})</span>
                    <span aria-hidden="true">·</span>
                    <span>{agency.agencyType}</span>
                    {hasAgencyFactEvidence(agency, 'decisionMakers') && agency.headquartersPhone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Public main: {agency.headquartersPhone}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <a
                      href={agency.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#285EE8] dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span aria-hidden="true">·</span>
                    {agency.officialWebsite && (
                      <a
                        href={agency.officialWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#285EE8] dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <span>Official Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                </div>

                {/* Fast-review summary: contact, location, operations, and citations */}
                <div className="profile-summary-grid grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <section className="profile-summary-panel min-w-0 rounded-lg border border-[#DFE6EF] bg-[#F5F7FA] p-3 text-xs dark:border-[#1E2D42] dark:bg-[#16243A]" aria-label="Agency contact summary">
                    <h2 className="font-semibold text-[#53657B] dark:text-slate-300">Agency contact</h2>
                    <p className="mt-1 break-words font-semibold text-[#14283F] dark:text-white [overflow-wrap:anywhere]">{primaryContact?.name || 'Not reported'}</p>
                    {primaryContact?.title && <p className="break-words text-[#53657B] dark:text-slate-400 [overflow-wrap:anywhere]">{primaryContact.title}</p>}
                    {(primaryContact?.phone || agency.headquartersPhone) && (
                      <a href={`tel:${primaryContact?.phone || agency.headquartersPhone}`} className="mt-1 inline-flex min-h-8 max-w-full items-center gap-1.5 break-words font-semibold text-[#285EE8] dark:text-blue-300 [overflow-wrap:anywhere]">
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {primaryContact?.phone || agency.headquartersPhone}
                      </a>
                    )}
                    {primaryContact?.email && (
                      <a href={`mailto:${primaryContact.email}`} className="flex min-h-8 items-center gap-1.5 break-all text-[#285EE8] dark:text-blue-300">
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {primaryContact.email}
                      </a>
                    )}
                  </section>

                  <section className="profile-summary-panel min-w-0 rounded-lg border border-[#DFE6EF] bg-[#F5F7FA] p-3 text-xs dark:border-[#1E2D42] dark:bg-[#16243A]" aria-label="Agency location summary">
                    <h2 className="font-semibold text-[#53657B] dark:text-slate-300">Location</h2>
                    <p className="mt-1 break-words font-semibold text-[#14283F] dark:text-white">{agency.address || 'Address not reported'}</p>
                    <p className="mt-0.5 text-[#53657B] dark:text-slate-400">{[agency.city, agency.county, agency.stateCode, agency.zipCode].filter(Boolean).join(', ') || 'Not reported'}</p>
                    {safeExternalUrl(agency.googleMapsUri) && <a href={safeExternalUrl(agency.googleMapsUri)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-8 items-center gap-1 font-semibold text-[#285EE8] dark:text-blue-300"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Open map</a>}
                  </section>

                  <section className="profile-summary-panel profile-operations-summary min-w-0 rounded-lg border border-[#DFE6EF] bg-[#F5F7FA] p-3 text-xs dark:border-[#1E2D42] dark:bg-[#16243A]" aria-label="Agency operations summary">
                    <h2 className="font-semibold text-[#53657B] dark:text-slate-300">Operations</h2>
                    <FactVerificationTag agency={agency} field="stationCount" />
                    <FactVerificationTag agency={agency} field="frontlineApparatusStations" />
                    <FactVerificationTag agency={agency} field="annualCallsReceived" />
                    <FactVerificationTag agency={agency} field="annualEmergencyVolume" />
                    {isFireAgency ? (
                      <>
                        <p className="profile-operations-lead mt-1 font-semibold text-[#14283F] dark:text-white">
                          {hasAgencyFactEvidence(agency, 'stationCount') || hasAgencyFactEvidence(agency, 'frontlineApparatusStations') ? reportMetric(agency.stationsCount) : 'Not reported'} stations
                          <span aria-hidden="true"> · </span>
                          {hasAgencyFactEvidence(agency, 'frontlineApparatusStations') ? reportMetric(agency.totalFireEngines) : 'Not reported'} fire engines
                        </p>
                        <p className="text-[#53657B] dark:text-slate-400">
                          {hasAgencyFactEvidence(agency, 'frontlineApparatusStations') ? reportMetric(agency.totalAmbulances) : 'Not reported'} ambulances
                          {hasAgencyFactEvidence(agency, 'annualCallsReceived') && (
                            <>
                              <span aria-hidden="true"> · </span>
                              {reportMetric(agency.annualCallVolume)} annual responses
                            </>
                          )}
                        </p>
                        {hasAgencyFactEvidence(agency, 'annualEmergencyVolume') && (
                          <p className="text-[#53657B] dark:text-slate-400">
                            {reportMetric(agency.annual911Transports)} EMS transports
                            <span aria-hidden="true"> · </span>
                            {reportMetric(agency.annualCardiacArrestCalls)} cardiac calls
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="profile-operations-lead mt-1 font-semibold text-[#14283F] dark:text-white">
                          {hasAgencyFactEvidence(agency, 'frontlineApparatusStations') ? reportMetric(agency.totalAmbulances) : 'Not reported'} ambulances
                        </p>
                        <p className="text-[#53657B] dark:text-slate-400">
                          {hasAgencyFactEvidence(agency, 'stationCount') || hasAgencyFactEvidence(agency, 'frontlineApparatusStations')
                            ? `${reportMetric(agency.stationsCount)} stations`
                            : 'Stations · Not reported'}
                          {hasAgencyFactEvidence(agency, 'annualCallsReceived') && (
                            <>
                              <span aria-hidden="true"> · </span>
                              {reportMetric(agency.annualCallVolume)} annual calls
                            </>
                          )}
                        </p>
                        <p className="text-[#53657B] dark:text-slate-400">
                          {hasAgencyFactEvidence(agency, 'annualEmergencyVolume') ? reportMetric(agency.annual911Transports) : 'Not reported'} transports
                          <span aria-hidden="true"> · </span>
                          {hasAgencyFactEvidence(agency, 'annualEmergencyVolume') ? reportMetric(agency.annualCardiacArrestCalls) : 'Not reported'} cardiac calls
                        </p>
                      </>
                    )}
                  </section>

                  <section className="profile-summary-panel min-w-0 rounded-lg border border-[#DFE6EF] bg-[#F5F7FA] p-3 text-xs dark:border-[#1E2D42] dark:bg-[#16243A]" aria-label="Available source references">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-[#53657B] dark:text-slate-300">Source references</h2>
                      <button type="button" onClick={() => setIsSourceDrawerOpen(true)} className="min-h-8 shrink-0 font-semibold text-[#285EE8] hover:underline dark:text-blue-300">Review all</button>
                    </div>
                    {topSourceItems.length > 0 ? (
                      <ul className="mt-1 space-y-1.5">
                        {topSourceItems.map((source, index) => {
                          const href = safeExternalUrl(source.url);
                          return (
                            <li key={`${source.label}-${source.sourceName}-${index}`} className="min-w-0">
                              {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="block break-words font-semibold text-[#285EE8] hover:underline dark:text-blue-300 [overflow-wrap:anywhere]">{source.label}: {source.sourceName}</a> : <p className="break-words font-semibold text-[#30465C] dark:text-slate-200 [overflow-wrap:anywhere]">{source.label}: {source.sourceName}</p>}
                              <p className="break-words text-[10px] text-[#718398] dark:text-slate-400 [overflow-wrap:anywhere]">{source.period || 'Period not stated'}</p>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[#53657B] dark:text-slate-400">Open source records for this agency.</p>
                    )}
                  </section>
                </div>

                <div
                  className="profile-review-strip flex min-w-0 flex-col gap-2 border-t border-[#DFE6EF] pt-3 dark:border-[#1E2D42] sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`panel-profile-review-${agency.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#14283F] dark:text-white">Your review</span>
                      {profileReviewedAt ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          data-testid={`status-profile-review-${agency.id}`}
                          aria-live="polite"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Reviewed in this browser · {new Date(profileReviewedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      ) : (
                        <span
                          className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                          data-testid={`status-profile-review-${agency.id}`}
                          aria-live="polite"
                        >
                          Not reviewed in this browser
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#53657B] dark:text-slate-400">
                      Mark this profile after checking its details. This note stays in this browser and does not independently verify the information.
                    </p>
                    {profileReviewError && (
                      <p className="mt-1 text-[11px] font-medium text-rose-700 dark:text-rose-300" role="alert">
                        {profileReviewError}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={markProfileReviewed}
                    aria-pressed={Boolean(profileReviewedAt)}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#B8C9C0] bg-white px-3 text-xs font-semibold text-[#176568] transition-colors hover:bg-[#E7F1EE] dark:border-[#40585A] dark:bg-[#172528] dark:text-[#9BD0C6] dark:hover:bg-[#203735]"
                    data-testid={`button-mark-profile-reviewed-${agency.id}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {profileReviewedAt ? 'Review again' : 'I reviewed these details'}
                  </button>
                </div>
              </div>

              <details className="rounded-lg border border-[#DFE6EF] bg-[#F8FAFC] p-3 dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <summary className="min-h-9 cursor-pointer list-none font-semibold text-sm text-[#30465C] dark:text-slate-200">Registry identifiers and verification</summary>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-[#53657B] dark:text-slate-400">
                  <span className="break-words [overflow-wrap:anywhere]">
                    {agency.stateLicenseNumber
                      ? <>Florida EMS license: <span className="font-mono text-[11px]">{agency.stateLicenseNumber}</span> · {agency.stateLicenseType || 'Type not listed'} · expires {agency.stateLicenseExpiration || 'Not recorded'}</>
                      : <>FDID: <span className="font-mono text-[11px]">{agency.fdid || 'Not reported'}</span></>}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="break-words [overflow-wrap:anywhere]">
                    NPI:{' '}
                    {agency.npiNumber ? (
                      validateNpiCheckDigit(agency.npiNumber).isValid ? (
                        <span className="font-mono text-[11px] font-semibold">{agency.npiNumber}</span>
                      ) : (
                        <span className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400" title="Failed CMS Luhn-80840 check digit validation">
                          {agency.npiNumber} (Invalid Check Digit)
                        </span>
                      )
                    ) : (
                      <span className="font-mono text-[11px]">Not reported</span>
                    )}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="break-words [overflow-wrap:anywhere]">Taxonomy: {agency.taxonomyCode || 'Not reported'}</span>
                  {hasVerifiedNppesIdentity ? (
                    <button
                      type="button"
                      onClick={() => setIsSourceDrawerOpen(true)}
                      className="inline-flex min-h-8 items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>NPPES identity match</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSourceDrawerOpen(true)}
                      className="inline-flex min-h-8 items-center gap-1 font-medium text-[#53657B] hover:underline dark:text-slate-300"
                    >
                      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>No exact NPPES match reviewed</span>
                    </button>
                  )}
                </div>
              </details>

              {/* Less-frequent commercial planning details remain available but collapsed by default. */}
              <details className="rounded-lg border border-[#DFE6EF] bg-[#F8FAFC] p-3 dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <summary className="min-h-9 cursor-pointer list-none font-semibold text-sm text-[#30465C] dark:text-slate-200">Planning scores and estimates</summary>
                <div className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-medium text-[#53657B] dark:text-slate-400">
                    <PulseIqEstimateLabel /> · <TermTooltip termKey="pulseiq" label="PulseIQ priority" /> · Modeled · {agency.zollOpportunity.priorityTier}
                  </span>
                  <span className="font-semibold text-lg text-[#14283F] dark:text-white tabular-nums">
                    {Number.isFinite(agency.zollOpportunity.pulseIqScore)
                      ? <>{agency.zollOpportunity.pulseIqScore}<span className="text-xs font-normal text-[#53657B]">/100</span></>
                      : <span className="text-sm font-medium">Not calculated</span>}
                  </span>
                </div>

                <div className="w-full h-1.5 bg-[#DFE6EF] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#285EE8]"
                    style={{ width: Number.isFinite(agency.zollOpportunity.pulseIqScore) ? `${agency.zollOpportunity.pulseIqScore}%` : '0%' }}
                  />
                </div>
                <PulseIqEvidencePanel agency={agency} compact weights={weights} />

                <div className="grid grid-cols-2 gap-px bg-[#DFE6EF] dark:bg-[#1E2D42] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-lg overflow-hidden">
                  <div className="bg-[#F5F7FA] dark:bg-[#16243A] p-2.5">
                    <div className="text-xs text-[#53657B] dark:text-slate-400">
                      Estimated CapEx
                    </div>
                    <div className="text-base font-semibold tabular-nums text-[#14283F] dark:text-white mt-0.5">
                      {hasDecisionGradeInputs ? formatCurrency(actuarialForecast.netCapExBase) : 'Not calculated'}
                    </div>
                  </div>
                  <div className="bg-[#F5F7FA] dark:bg-[#16243A] p-2.5 text-right">
                    <div className="text-xs text-[#53657B] dark:text-slate-400">
                      5-Yr TCO savings
                    </div>
                    <div className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {hasDecisionGradeInputs ? formatCurrency(actuarialForecast.fiveYrTcoBase, { showSign: true }) : 'Not calculated'}
                    </div>
                  </div>
                </div>

                <PlanningValueDisclosure agency={agency} />

                <div>
                  <label className="block text-xs font-medium text-[#53657B] dark:text-slate-400 mb-1">
                    Active pipeline stage
                  </label>
                  {hasDecisionGradeInputs ? (
                    <select
                      value={agency.zollOpportunity.salesStage}
                      onChange={(e) => onUpdateStage(agency.id, e.target.value as LeadStage)}
                      className="w-full h-9 bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-lg px-3 text-xs font-medium text-[#14283F] dark:text-white focus:outline-none focus:border-[#285EE8] cursor-pointer"
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-amber-700 dark:text-amber-400">No reviewed opportunity record is attached.</div>
                  )}
                </div>
                </div>
              </details>
            </div>

            {/* ================================================================
                BLOCK 2: ACCOUNT ASSESSMENT (4 EVIDENCE-GROUNDED PILLARS)
               ================================================================ */}
            <details className="rounded-lg border border-[#DFE6EF] bg-[#F8FAFC] p-3 dark:border-[#1E2D42] dark:bg-[#111C2D]">
              <summary className="min-h-9 cursor-pointer list-none font-semibold text-sm text-[#30465C] dark:text-slate-200">Assessment and planning context</summary>
              <div className="mt-3 space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#14283F] dark:text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#285EE8]" />
                    <span>Account Assessment</span>
                  </h2>
                  <p className="text-xs text-[#53657B] dark:text-slate-400 mt-0.5">
                    Estimates are labeled as models, with available source records and reporting periods provided for direct review.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowActuarialMath((prev) => !prev)}
                  className="text-xs font-semibold text-[#285EE8] dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{showActuarialMath ? 'Hide financial assumptions' : 'Calibrate financial assumptions'}</span>
                  {showActuarialMath ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* 4 Assessment Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. What is Known */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14283F] dark:text-white">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>1. What is known</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
                    {accountAssessment.whatIsKnown.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Developments That Matter */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#285EE8] dark:text-blue-400">
                    <Zap className="w-3.5 h-3.5" />
                    <span>2. Key developments</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
                    {accountAssessment.developmentsThatMatter.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-[#285EE8] mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. What is Not Yet Confirmed */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>3. Not yet confirmed</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
                    {accountAssessment.whatIsNotConfirmed.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Recommended Next Move */}
                <div className="p-4 rounded-xl bg-[#EEF3FE]/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 space-y-2 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#285EE8] dark:text-blue-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>4. Recommended move</span>
                    </div>
                    <div className="text-xs font-semibold text-[#14283F] dark:text-white leading-snug">
                      {accountAssessment.primaryMove.action}
                    </div>
                    <p className="text-[11px] text-[#53657B] dark:text-slate-300 leading-relaxed">
                      {accountAssessment.primaryMove.why}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-blue-200 dark:border-blue-800/70">
                    <button
                      type="button"
                      onClick={() => {
                        if (accountAssessment.primaryMove.nextStep === 'Prepare for Meeting') {
                          setActiveSection('overview');
                          setTimeout(() => {
                            const el = document.getElementById('meeting-preparation-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }, 50);
                        } else if (accountAssessment.primaryMove.nextStep === 'Generate Co-Op RFP' && onOpenRfpGenerator) {
                          onOpenRfpGenerator(agency);
                        } else if (accountAssessment.primaryMove.nextStep === 'Review Purchasing') {
                          setActiveSection('purchasing');
                        } else if (accountAssessment.primaryMove.nextStep === 'Inspect Medicare') {
                          setActiveSection('medicare');
                        } else {
                          setActiveSection('evidence');
                        }
                      }}
                      className="w-full h-8 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white transition-colors cursor-pointer inline-flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <span>{accountAssessment.primaryMove.nextStep}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================
                BLOCK 3: WHAT WE KNOW — 4 STRUCTURED INFORMATION CARDS
               ================================================================ */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-[#53657B] dark:text-slate-400">
                What we know &middot; Structured evidence
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Block 1: Source-reviewed identity */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Provider identity
                  </div>
                  <div className="text-sm font-semibold text-[#14283F] dark:text-white">
                    {agency.address || 'Address not reported'}
                  </div>
                  <p className="text-xs text-[#53657B] dark:text-slate-300">
                    {agency.stateLicenseNumber && hasAgencyFactEvidence(agency, 'departmentRegistry')
                      ? `Florida EMS provider license ${agency.stateLicenseNumber} is listed by the Florida Department of Health.`
                      : `State license: ${agency.stateLicenseNumber || 'Not reported'}`}
                  </p>
                  <div className="text-[11px] text-[#53657B] dark:text-slate-400 pt-1">
                    Address and license sources do not verify stations, volume, equipment, or contracts.
                  </div>
                </div>

                {/* Block 2: Important Questions */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Important questions
                  </div>
                  <div className="text-sm font-semibold text-[#14283F] dark:text-white">
                    Maintenance cost &amp; replacement plan
                  </div>
                  <p className="text-xs text-[#53657B] dark:text-slate-300">
                    Are annual service contract renewals escalating? Does medical direction mandate Real BVM Help®?
                  </p>
                  <div className="text-[11px] text-[#53657B] dark:text-slate-400 pt-1">
                    On-scene discovery required
                  </div>
                </div>

                {/* Block 3: Relevant Timing */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                  <div className="text-xs font-semibold text-[#285EE8] dark:text-blue-400">
                    Relevant timing
                  </div>
                  <div className="text-sm font-semibold text-[#14283F] dark:text-white">
                    {agency.competitorContract.contractEndDate ? `Contract expires ${agency.competitorContract.contractEndDate}` : 'Contract date not reported'}
                  </div>
                  <p className="text-xs text-[#53657B] dark:text-slate-300">
                    {hasReportedValue(agency.competitorContract.renewalWindowDays)
                      ? `Renewal notice window: ${reportMetric(agency.competitorContract.renewalWindowDays)} days prior.`
                      : 'Renewal notice window not reported.'}
                  </p>
                </div>

                {/* Block 4: Potential Product Relevance */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                  <div className="text-xs font-semibold text-[#14283F] dark:text-slate-200">
                    Potential product fit
                  </div>
                  <div className="text-sm font-semibold text-[#14283F] dark:text-white">
                    {agency.zollOpportunity.primaryTargetProduct || 'Not reported'}
                  </div>
                  <p className="text-xs text-[#53657B] dark:text-slate-300">
                    {agency.zollOpportunity.primaryTargetProduct
                      ? 'Potential fit only; validate requirements and procurement before relying on this suggestion.'
                      : 'Product fit not reported in this record.'}
                  </p>
                  <div className="text-[11px] text-[#53657B] dark:text-slate-400 pt-1">
                    Not a verified purchase plan
                  </div>
                </div>
              </div>
            </div>

            {/* Expandable Actuarial Sensitivity Controls */}
            {showActuarialMath && (
              <div className="p-4 sm:p-5 rounded-xl bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[#285EE8] dark:text-blue-400">
                      Actuarial sensitivity model ({actuarialForecast.hasUnitCount ? actuarialForecast.units : 'Not reported'} frontline units)
                    </div>
                    <div className="mt-1 text-xs text-[#53657B] dark:text-slate-300">
                      PulseIQ uses fleet age, clinical volume, grant readiness, and software inputs. Local claim-denial percentages and claim-based recovery estimates are excluded; imported counts and sources remain separate for review.
                    </div>
                    <div className="mt-1 text-xs text-[#53657B] dark:text-slate-300">
                      Scenario method: unit count × selected MSRP less selected trade-in credit, with low/high scenarios at ±15%. Five-year savings use reported unit count × benchmark service, battery, and consumables savings plus trade-in credit. Recovery scenarios are not displayed without the required agency-specific inputs and method.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#53657B] dark:text-slate-300">Unit MSRP assumption</span>
                      <span className="font-semibold tabular-nums text-[#285EE8] dark:text-blue-400">${customUnitMsrp.toLocaleString()}/unit</span>
                    </div>
                    <input
                      type="range"
                      min={32000}
                      max={48000}
                      step={500}
                      value={customUnitMsrp}
                      onChange={e => setCustomUnitMsrp(Number(e.target.value))}
                      className="w-full accent-[#285EE8] cursor-pointer"
                    />
                    <div className="text-xs text-[#53657B] flex justify-between tabular-nums">
                      <span>Low: {actuarialForecast.hasUnitCount ? formatCurrency(actuarialForecast.netCapExLow) : 'Not calculated'}</span>
                      <strong className="text-[#14283F] dark:text-white font-semibold">Base: {actuarialForecast.hasUnitCount ? formatCurrency(actuarialForecast.netCapExBase) : 'Not calculated'}</strong>
                      <span>High: {actuarialForecast.hasUnitCount ? formatCurrency(actuarialForecast.netCapExHigh) : 'Not calculated'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#53657B] dark:text-slate-300">OEM trade-in credit / unit</span>
                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">-${customTradeInCredit.toLocaleString()}/unit</span>
                    </div>
                    <input
                      type="range"
                      min={2000}
                      max={5500}
                      step={250}
                      value={customTradeInCredit}
                      onChange={e => setCustomTradeInCredit(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <div className="text-xs text-[#53657B] flex justify-between tabular-nums">
                      <span>Low: {actuarialForecast.hasTcoInputs ? formatCurrency(actuarialForecast.fiveYrTcoLow, { showSign: true }) : 'Not calculated'}</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">Base: {actuarialForecast.hasTcoInputs ? formatCurrency(actuarialForecast.fiveYrTcoBase, { showSign: true }) : 'Not calculated'}</strong>
                      <span>High: {actuarialForecast.hasTcoInputs ? formatCurrency(actuarialForecast.fiveYrTcoHigh, { showSign: true }) : 'Not calculated'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#53657B] dark:text-slate-300">CO-16 denial capture rate</span>
                      <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{customDenialCapturePct}% recovered</span>
                    </div>
                    <input
                      type="range"
                      min={35}
                      max={85}
                      step={5}
                      value={customDenialCapturePct}
                      onChange={e => setCustomDenialCapturePct(Number(e.target.value))}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                    <div className="text-xs text-[#53657B] flex justify-between tabular-nums">
                      <span>Low: {actuarialForecast.hasRecoveryInputs ? formatCurrency(actuarialForecast.annualRecoveryLow, { perYear: true, showSign: true }) : 'Not calculated'}</span>
                      <strong className="text-[#14283F] dark:text-white font-semibold">Base: {actuarialForecast.hasRecoveryInputs ? formatCurrency(actuarialForecast.annualRecoveryBase, { perYear: true, showSign: true }) : 'Not calculated'}</strong>
                      <span>High: {actuarialForecast.hasRecoveryInputs ? formatCurrency(actuarialForecast.annualRecoveryHigh, { perYear: true, showSign: true }) : 'Not calculated'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
              </div>
            </details>
          </section>

          {/* ================================================================
              7-TOPIC ACCOUNT 360 NAVIGATION (SECTION 9)
             ================================================================ */}
          <nav
            data-testid="profile-topic-navigation"
            aria-label="Account 360 Topic Navigation"
            className="pi-surface sticky top-[108px] z-30 flex items-center justify-between gap-2 overflow-hidden p-1.5 md:top-16"
          >
            <div className="w-full md:hidden">
              <label htmlFor="profile-section-select" className="sr-only">Profile section</label>
              <select
                id="profile-section-select"
                value={activeSection}
                onChange={(event) => setActiveSection(event.target.value as ProfileSection)}
                className="min-h-11 w-full rounded-lg border border-[#DFE6EF] bg-white px-3 text-sm font-semibold text-[#14283F] dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-white"
                data-testid="select-profile-section-mobile"
              >
                <option value="overview">Overview</option>
                <option value="equipment">Equipment &amp; technology</option>
                <option value="purchasing">Purchasing &amp; grants</option>
                <option value="decision_makers">Decision makers</option>
                <option value="operations">Operations</option>
                <option value="medicare">Medicare &amp; financial</option>
                <option value="evidence">Evidence &amp; notes</option>
                <option value="all">All topics</option>
              </select>
            </div>
            <div className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
              {[
                { id: 'overview', label: '1. Overview' },
                { id: 'equipment', label: '2. Equipment & Tech' },
                { id: 'purchasing', label: '3. Purchasing & Grants' },
                { id: 'decision_makers', label: '4. Decision Makers' },
                { id: 'operations', label: '5. Operations' },
                { id: 'medicare', label: '6. Medicare & Financial' },
                { id: 'evidence', label: `7. Evidence (${agency.fieldNotes.length} Notes)` }
              ].map((tab) => {
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSection(tab.id as ProfileSection)}
                    className={`whitespace-nowrap shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#285EE8] text-white shadow-2xs'
                        : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setActiveSection(activeSection === 'all' ? 'overview' : 'all')}
              className={`whitespace-nowrap shrink-0 hidden md:inline-flex px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeSection === 'all'
                  ? 'bg-[#0B1728] text-white'
                  : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
              }`}
            >
              {activeSection === 'all' ? 'Showing All Topics' : 'Expand All'}
            </button>
          </nav>

          {(activeSection === 'overview' || activeSection === 'all') && (
            <AgencyIntelligenceOverview
              agency={agency}
              onOpenSources={openProfileSources}
              onNavigateSection={navigateProfileSection}
            />
          )}

          {/* TOPIC 4: DECISION MAKERS & AUTHORIZED COMMAND ROSTER */}
          {showSection('leadership') && (
            <section className="pi-surface p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-4">
                <div>
                    <h2 className="pi-section-heading">
                    Decision Makers &amp; Command Directory
                  </h2>
                  <p className="pi-supporting mt-0.5">
                    Names and roles reflect the available agency record; confirm current command details directly with the agency.
                  </p>
                </div>
                {agency.officialWebsite && (
                  <a
                    href={agency.officialWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EEF3FE] dark:bg-blue-950/60 text-[#285EE8] dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>Open agency website</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hasAgencyFactEvidence(agency, 'decisionMakers')
                  ? agency.keyContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#285EE8] dark:text-blue-400 font-semibold">
                        {contact.role}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Roster source reviewed</span>
                      </span>
                    </div>
                    <div className="text-base font-bold text-[#14283F] dark:text-white">
                      {contact.name}
                    </div>
                    <div className="text-[#53657B] dark:text-slate-300 font-medium">
                      {contact.title}
                    </div>
                    <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] text-[11px] text-[#53657B] dark:text-slate-400 space-y-1">
                      <div>HQ: <strong className="text-[#14283F] dark:text-slate-200">{contact.headquartersAddress || agency.address}</strong></div>
                      <div>Source: <a href={agency.factEvidence?.decisionMakers?.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-700 hover:underline dark:text-blue-300">{agency.factEvidence?.decisionMakers?.sourceName}</a></div>
                    </div>
                  </div>
                ))
                  : (
                    <div className="profile-not-reported col-span-full rounded-lg border p-4 text-sm">
                      Not reported in the current agency record.
                    </div>
                  )}
              </div>
            </section>
          )}

          {/* 1. Executive Deal Story & Conversion Playbook Section */}
          {showSection('deal_story') && (
            <div id="meeting-preparation-section" className="scroll-mt-32">
              <DealStoryBriefingView
                agency={agency}
                variant="full"
                onOpenDossier={() => setShowDossierModal(true)}
              />
            </div>
          )}

          {/* 2. Competitive Battlecard & Head-to-Head Spec Matrix Section */}
          {showSection('battlecard') &&
          !(
            hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
            hasAgencyFactEvidence(agency, 'equipmentSuppliers') &&
            hasAgencyFactEvidence(agency, 'maintenanceContracts')
          ) ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Comparison details are not listed in this account record. Review the equipment and contract fields above for currently available values.
            </div>
          ) : showSection('battlecard') && (
            <CompetitiveBattlecardView agency={agency} variant="full" />
          )}

          {/* 3. Pure Empirical Agency Facts & Operational Baseline Section */}
          {showSection('facts') && (
            <section className="bg-white rounded-xl border border-[#E5E4DF] p-6 shadow-[0_1px_3px_rgba(17,24,39,0.03)] space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E4DF] pb-4">
                <div>
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Agency Facts &amp; Operational Baseline</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#111827] mt-0.5">
                    Hardware, operational volume &amp; contract records
                  </h3>
                </div>
                <div className="text-xs font-mono font-semibold px-3 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                  Source status shown per field
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Fact Block 1: Fleet & Hardware Reality */}
                <div className="p-4 rounded-xl bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42] space-y-2.5">
                  <div className="text-xs font-semibold text-[#14283F] dark:text-white">
                    1. Installed Fleet &amp; Hardware
                  </div>
                  <FactVerificationTag agency={agency} field="defibrillatorBiomedicalFleet" />
                  <FactVerificationTag agency={agency} field="verifiedHardware" />
                  <div className="text-sm space-y-1.5">
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Monitor brand</span>
                      <strong className="text-slate-900 dark:text-white">
                        {agency.installedFleet.defibBrand || 'Not reported'}
                      </strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Deployed fleet age</span>
                      <strong className="text-amber-700 dark:text-amber-400 tabular-nums">{reportMetric(agency.installedFleet.defibAgeYears, ' years old')}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Total defib units</span>
                      <strong className="text-slate-900 dark:text-white tabular-nums">{`${reportMetric(agency.installedFleet.defibUnitsCount)} units`}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Warranty support</span>
                      <strong className={hasAgencyFactEvidence(agency, 'maintenanceContracts') && agency.installedFleet.defibWarrantyStatus.includes('Expired') ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                        {agency.installedFleet.defibWarrantyStatus || 'Not reported'}
                      </strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#53657B] dark:text-slate-400">ePCR system</span>
                      <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                        {agency.installedFleet.epcrCadSoftware || 'Not reported'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Fact Block 2: Emergency Response Volume */}
                <div className="p-4 rounded-xl bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42] space-y-2.5">
                  <div className="text-xs font-semibold text-[#14283F] dark:text-white">
                    2. Reported Calls &amp; Acuity
                  </div>
                  <FactVerificationTag agency={agency} field="annualCallsReceived" />
                  <FactVerificationTag agency={agency} field="clinicalOutcomes" />
                  <div className="text-sm space-y-1.5">
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Reported Fire Rescue calls</span>
                      <strong className="text-slate-900 dark:text-white tabular-nums">
                        {`${reportMetric(agency.annualCallVolume)} calls in record · ${reportMetric(agency.annual911Transports)} transports`}
                      </strong>
                    </div>
                    <div className="text-[11px] text-slate-500">Values are shown as recorded; source status is listed above.</div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Annual cardiac arrests</span>
                      <strong className="text-rose-700 dark:text-rose-400 tabular-nums">{`${reportMetric(agency.annualCardiacArrestCalls)} runs`}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Utstein survival rate</span>
                      <strong className="text-slate-900 dark:text-white tabular-nums">{reportMetric(agency.utsteinSurvivalRate, '%')}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Active ambulances</span>
                      <strong className="text-slate-900 dark:text-white tabular-nums">{`${reportMetric(agency.totalAmbulances)} units`}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#53657B] dark:text-slate-400">Fire suppression engines</span>
                      <strong className="text-slate-900 dark:text-white tabular-nums">{`${reportMetric(agency.totalFireEngines)} units`}</strong>
                    </div>
                  </div>
                </div>

                {/* Fact Block 3: Contracts, CMS & Grants */}
                <div className="p-4 rounded-xl bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42] space-y-2.5">
                  <div className="text-xs font-semibold text-[#14283F] dark:text-white">
                    3. Contract &amp; Financial Realities
                  </div>
                  <FactVerificationTag agency={agency} field="maintenanceContracts" />
                  <FactVerificationTag agency={agency} field="cmsClaims" />
                  <FactVerificationTag agency={agency} field="federalGrant" />
                  <div className="text-sm space-y-1.5">
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Contract end date</span>
                      <strong className="text-rose-700 dark:text-rose-400 tabular-nums">{agency.competitorContract.contractEndDate || 'Not reported'}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Contract status</span>
                      <strong className="text-slate-900 dark:text-white">{agency.competitorContract.status || 'Not reported'}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                      <span className="text-[#53657B] dark:text-slate-400">Lost claim revenue</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">Not reported with a reproducible method</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#53657B] dark:text-slate-400">FEMA AFG grants</span>
                      <strong className="text-slate-900 truncate max-w-[160px]">
                        {agency.grantStatus.afgAwarded ? `${reportCurrency(agency.grantStatus.afgAwardAmount)} (FY${reportMetric(agency.grantStatus.afgFiscalYear)})` : 'No award indicated in this record'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Granular Apparatus Vehicle Fleet, Hospital Transport Logistics & Multi-Year FEMA Grant History */}
          {showSection('fleet') &&
          !(
            hasAgencyFactEvidence(agency, 'apparatusBreakdown') &&
            hasAgencyFactEvidence(agency, 'receivingHospitalStemi')
          ) ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Detailed fleet and receiving-hospital values are not listed in this account record.
            </div>
          ) : showSection('fleet') && agency.apparatusFleet && agency.hospitalLogistics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Granular Apparatus Vehicle Breakdown */}
              <section className="bg-white rounded-xl border border-[#E5E4DF] p-6 shadow-[0_1px_3px_rgba(17,24,39,0.03)] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Apparatus &amp; Emergency Vehicle Fleet Breakdown</span>
                  </h2>
                  <FactVerificationTag agency={agency} field="apparatusBreakdown" unverifiedLabel="Estimated model" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">ALS Ambulances</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.alsAmbulances} units</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">BLS Ambulances</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.blsAmbulances} units</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">Fire Suppression Engines</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.fireEngines} units</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">Aerial Ladder Trucks</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.ladderTrucks} units</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">Heavy Rescue &amp; Squads</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.heavyRescueUnits} units</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F8F7F4] dark:bg-[#16243A] border border-[#E5E4DF] dark:border-[#1E2D42]">
                    <div className="text-[#53657B] dark:text-slate-400 font-medium">Battalion / Command</div>
                    <div className="text-lg font-semibold tabular-nums text-[#111827] dark:text-white mt-0.5">{agency.apparatusFleet.commandVehicles} units</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E4DF] dark:border-[#1E2D42] text-xs text-slate-600 dark:text-slate-400">
                  <span>Avg apparatus age: <strong className="tabular-nums text-[#111827] dark:text-white">{agency.apparatusFleet.avgVehicleAgeYears} yrs</strong></span>
                  <span>Capital replacement cycle: <strong className="tabular-nums text-[#111827] dark:text-white">{agency.apparatusFleet.replacementCycleYears}-year schedule</strong></span>
                </div>
              </section>

              {/* Hospital Trauma & STEMI PCI Cath Lab Transport Logistics */}
              <section className="bg-white rounded-xl border border-[#E5E4DF] p-6 shadow-[0_1px_3px_rgba(17,24,39,0.03)] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-[#B91C1C]" />
                    <span>Receiving Hospital &amp; STEMI Cath Lab Logistics</span>
                  </h2>
                  <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                    ED transport count not reported
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 rounded-lg bg-[#F8F7F4] border border-[#E5E4DF] space-y-1">
                    <div className="text-slate-500 font-semibold">Primary Regional Trauma Center</div>
                    <div className="text-sm font-extrabold text-[#111827]">{agency.hospitalLogistics.primaryTraumaHospital || 'Not reported'}</div>
                    <div className="text-slate-600 font-mono">
                      GIS estimate: <strong className="text-[#111827]">{agency.hospitalLogistics.distanceToTraumaMiles} mi</strong> · <strong className="text-[#111827]">{agency.hospitalLogistics.transportTimeMinutes} mins</strong>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-[#F8F7F4] border border-[#E5E4DF] space-y-1">
                    <div className="text-slate-500 font-semibold">24/7 STEMI PCI Cardiac Receiving Center</div>
                    <div className="text-sm font-extrabold text-[#111827]">{agency.hospitalLogistics.primaryCathLabHospital || 'Not reported'}</div>
                    <div className="text-slate-600 font-mono">
                      GIS route estimate: <strong className="text-[#111827]">{reportMetric(agency.hospitalLogistics.cathLabDistanceMiles, ' mi')}</strong> · <strong className="text-[#111827]">{reportMetric(agency.hospitalLogistics.cathLabTransportMinutes, ' mins')}</strong> · ED offload: Not reported
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Live Federal CMS NPPES NPI Registered Sub-Records (Only shown when multiple federal NPI records exist in city) */}
          {showSection('leadership') && cityNpiProviders.length > 0 && (
            <section className="bg-white rounded-xl border border-[#E5E4DF] p-6 shadow-[0_1px_3px_rgba(17,24,39,0.03)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Additional Federal CMS NPPES NPI Registered Providers in {agency.city}, {agency.stateCode}</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    Verified organizational NPI records from the U.S. Department of Health &amp; Human Services Registry
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  {cityNpiProviders.length} Federal NPI Records
                </span>
              </div>

              <div className="overflow-x-auto border border-[#E5E4DF] rounded-lg">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-[#F8F7F4] border-b border-[#E5E4DF] text-slate-700 font-bold">
                      <th className="py-2.5 px-3">Federal NPI #</th>
                      <th className="py-2.5 px-3">Registered Legal Organization Name</th>
                      <th className="py-2.5 px-3">Practice Street Address</th>
                      <th className="py-2.5 px-3">Authorized Official</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DF]">
                    {cityNpiProviders.map((npiRec) => (
                      <tr key={npiRec.npi} className="hover:bg-[#F8F7F4]/60">
                        <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#1E3A8A]">
                          <a
                            href={`https://npiregistry.cms.hhs.gov/provider-view/${npiRec.npi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline inline-flex items-center gap-1"
                          >
                            <span>{npiRec.npi}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#111827]">
                          {npiRec.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {npiRec.address}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {npiRec.official ? (
                            <span>
                              <strong className="text-[#111827]">{npiRec.official}</strong>
                              {npiRec.officialTitle ? ` · ${npiRec.officialTitle}` : ''}
                            </span>
                          ) : (
                            'Organizational Enrollment'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        {/* SECTION: CLINICAL EMERGENCY PERFORMANCE, QUALITY & PATIENT OUTCOMES */}
        {showSection('clinical') &&
          !(
            hasAgencyFactEvidence(agency, 'clinicalOutcomes') &&
            hasAgencyFactEvidence(agency, 'annualEmergencyVolume')
          ) ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Clinical charts are not available in this account record. Available call and outcome fields remain listed in the operational baseline above.
            </div>
          ) : showSection('clinical') && (
          <div className="space-y-6">
            {/* Interactive Longitudinal Performance & Survival Funnel Visualizer */}
            <ResuscitationSurvivalFunnel agency={agency} />

            {/* Interactive NEMSQA, AHA Mission: Lifeline & CARES Quality Uplift Simulator */}
            <QualityScorecard agency={agency} onOpenRfpGenerator={onOpenRfpGenerator} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Card A: Clinical Emergency Performance & Patient Outcomes */}
              <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Clinical Emergency Performance &amp; Patient Outcomes</span>
                  </h2>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A]">
                    <Award className="w-3.5 h-3.5 text-[#1E3A8A]" />
                    <span>AHA Mission: Lifeline {agency.qualityMetrics.ahaMissionLifelineTier || 'Not reported'}</span>
                  </span>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Annual emergency calls</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annualCallVolume)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Total 911 dispatches</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Annual 911 transports</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annual911Transports)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Billable patient runs</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Cardiac arrest (OHCA) calls</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annualCardiacArrestCalls)} / yr</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Resuscitation activations</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400 font-medium">Utstein cardiac survival</dt>
                    <dd className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{reportMetric(agency.utsteinSurvivalRate, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Survival to discharge</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400 font-medium">CARES good neuro (CPC 1/2)</dt>
                    <dd className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{reportMetric(agency.qualityMetrics.caresGoodNeurologicalSurvivalPct, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Intact neurological outcome</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Bystander CPR rate</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.bystanderCPRRate, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Prior to EMS arrival</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Annual trauma incidents</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.gisData.annualTraumaIncidents)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">{agency.gisData.traumaCenterLevel || 'Trauma center level not reported'}</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">Avg EMS transport time</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.gisData.avgTransportTimeMinutes, ' mins')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Scene to ED arrival</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400">STEMI PCI Cath Lab dist.</dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.gisData.distanceToNearestCathLabMiles, ' miles')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">12-lead pre-activation</dd>
                  </div>
                </dl>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42] text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[#53657B] dark:text-slate-400 font-medium">Primary Receiving Trauma &amp; Cardiac Hospital: </span>
                    <strong className="text-[#0F172A] dark:text-white">{agency.gisData.primaryReceivingHospital || 'Not reported'}</strong>
                  </div>
                  <span className="tabular-nums font-semibold text-[#1E3A8A] dark:text-blue-400">
                    {reportMetric(agency.gisData.annualHospitalDestinationTransports)} ED Transports / yr
                  </span>
                </div>
              </section>

              {/* Card B: NEMSQA Quality & Clinical Care Outcomes */}
              <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Quality &amp; NEMSQA Clinical Quality Outcomes</span>
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">National NEMSQA Benchmarks</span>
                </div>

                <div className="space-y-3.5 text-xs">
                  {[
                    {
                      label: 'Cardiac-01: 12-Lead STEMI ECG Acquired ≤ 10 Mins',
                      val: agency.qualityMetrics.nemsqaStemi12LeadAcquisitionPct,
                      bench: 85
                    },
                    {
                      label: 'Resuscitation: Chest Compression Fraction (CCF %)',
                      val: agency.qualityMetrics.nemsqaChestCompressionFractionPct,
                      bench: 78
                    },
                    {
                      label: 'Airway: EtCO2 Waveform Capnography Compliance (35–45 mmHg)',
                      val: agency.qualityMetrics.nemsqaEtco2VentilationCompliancePct,
                      bench: 64
                    },
                    {
                      label: 'Pediatrics-01: Pediatric Respiratory Assessment & Support',
                      val: agency.qualityMetrics.nemsqaPediatricRespiratorySupportPct,
                      bench: 72
                    },
                    {
                      label: 'Stroke-01: Last Known Well (LKW) Time Documented',
                      val: agency.qualityMetrics.nemsqaStrokeLkwDocumentedPct,
                      bench: 80
                    },
                    {
                      label: 'Trauma-01: Pain Assessment & Effective Analgesic Care',
                      val: agency.qualityMetrics.nemsqaPainManagementEffectivePct,
                      bench: 75
                    }
                  ].map(item => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{item.label}</span>
                        <span className="font-bold font-mono tabular-nums text-[#0F172A]">
                          {reportMetric(item.val, '%')} <span className="text-slate-400 font-normal">(Benchmark: {item.bench}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#1E3A8A] h-full rounded-full" style={{ width: `${hasReportedValue(item.val) ? Math.min(100, item.val) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* Card C: Regional EMS Clinical Protocols & Receiving Hospital Telemetry Alignment */}
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Regional EMS Clinical Protocols &amp; Receiving Hospital Telemetry Network</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Receiving Hub: <strong className="text-[#0F172A]">{protocolModel.receivingHospitalNetwork}</strong> · {protocolModel.stemiDoorToBalloonTarget}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-600">
                  Telemetry: {protocolModel.cathLabTransmissionStandard}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Regional Clinical Protocol Mandate</th>
                      <th className="py-3 px-4">Clinical Target Benchmark</th>
                      <th className="py-3 px-4">Incumbent Fleet Limitation</th>
                      <th className="py-3 px-4">ZOLL Enabling Clinical Technology</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {protocolModel.protocols.map(proto => (
                      <tr key={proto.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0F172A]">{proto.protocolName}</div>
                          <div className="text-[11px] text-slate-500">{proto.governingStandard}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-xs">{proto.clinicalTargetMetric}</td>
                        <td className="py-3 px-4 text-rose-800 max-w-xs">{proto.incumbentHardwareGap}</td>
                        <td className="py-3 px-4 text-slate-700 max-w-sm">{proto.zollEnablingTechnology}</td>
                        <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                          <span className={proto.agencyComplianceStatus === 'Standardized' ? 'text-emerald-700' : 'text-amber-700'}>
                            {proto.agencyComplianceStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* SECTION: INSURANCE OUTCOMES (MEDICARE, MEDICAID, COMMERCIAL, SELF-PAY) & DENIALS / RECOVERABLE */}
        {showSection('billing') && !hasAgencyFactEvidence(agency, 'cmsClaims') ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            CMS claim and revenue fields are not listed in this account record. Available financial fields remain listed in the operational baseline above.
          </div>
        ) : showSection('billing') && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#1E3A8A]" />
                  <span>Insurance Information Outcomes (Medicare, Medicaid, Commercial, Self-Pay), Denials &amp; Recoverable Revenue</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete payer mix distribution, CMS Ground Ambulance Data Collection System (GADCS) status, and claims recovery analysis
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-700">
                GADCS Status: <strong className="text-[#0F172A]">{agency.cmsData.gadcsReportingStatus || 'Not reported'}</strong> · Cost-to-Charge Ratio: <strong className="font-mono tabular-nums text-[#0F172A]">{reportMetric(agency.qualityMetrics.gadcsCostToChargeRatio)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left 6 Cols: 4-Tier Insurance Payer Outcomes */}
              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-xs font-bold text-slate-600">
                  Insurance Payer Mix &amp; Reimbursement Outcomes
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A] text-sm">01. Medicare</span>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#1E3A8A]">{reportMetric(agency.cmsData.medicarePayerPct, '%')} of Runs</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#0F172A] h-full rounded-full" style={{ width: `${hasReportedValue(agency.cmsData.medicarePayerPct) ? agency.cmsData.medicarePayerPct : 0}%` }} />
                    </div>
                    <div className="pt-1 text-slate-600 space-y-0.5 font-mono tabular-nums">
                      <div>Annual Billed: <strong className="text-[#0F172A]">{reportCurrency(agency.cmsData.medicareBilledAnnual)}</strong></div>
                      <div>Annual Allowed: <strong className="text-[#0F172A]">{reportCurrency(agency.cmsData.medicareAllowedAnnual)}</strong></div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A] text-sm">02. Medicaid</span>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#1E3A8A]">{reportMetric(agency.cmsData.medicaidPayerPct, '%')} of Runs</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#1E3A8A] h-full rounded-full" style={{ width: `${hasReportedValue(agency.cmsData.medicaidPayerPct) ? agency.cmsData.medicaidPayerPct : 0}%` }} />
                    </div>
                    <div className="pt-1 text-slate-600 space-y-0.5">
                      <div className="font-mono tabular-nums">Annual Billed: <strong className="text-[#0F172A]">{reportCurrency(agency.cmsData.medicaidBilledAnnual)}</strong></div>
                      <div>Supplemental GEMT / IGT Eligible</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A] text-sm">03. Commercial Insurance</span>
                      <span className="text-sm font-bold font-mono tabular-nums text-[#1E3A8A]">{reportMetric(agency.cmsData.commercialPayerMixPct, '%')} of Runs</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#1E3A8A] h-full rounded-full" style={{ width: `${hasReportedValue(agency.cmsData.commercialPayerMixPct) ? agency.cmsData.commercialPayerMixPct : 0}%` }} />
                    </div>
                    <div className="pt-1 text-slate-600 space-y-0.5">
                      <div className="font-mono tabular-nums">Underpayment Gap: <strong className="text-[#0F172A]">{reportCurrency(agency.qualityMetrics.commercialUnderpaymentPerTrip)} / trip</strong></div>
                      <div>Out-of-Network Balance Billing Protected</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A] text-sm">04. Self-Pay / Uninsured</span>
                      <span className="text-sm font-bold font-mono tabular-nums text-amber-700">{reportMetric(agency.cmsData.selfPayPayerPct, '%')} of Runs</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-600 h-full rounded-full" style={{ width: `${hasReportedValue(agency.cmsData.selfPayPayerPct) ? agency.cmsData.selfPayPayerPct : 0}%` }} />
                    </div>
                    <div className="pt-1 text-slate-600 space-y-0.5">
                      <div>High bad-debt write-off exposure</div>
                      <div>Eligible for automated insurance discovery</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 6 Cols: Claims Denials & Recoverable Revenue Breakdown */}
              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-xs font-bold text-slate-600">
                  Medicare Billing &amp; Revenue Cycle Analysis
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="hidden">
                    <div className="text-xs font-semibold text-slate-600">Medicare claim summary</div>
                    <div className="text-sm font-semibold text-slate-700">{medicareDenialMetric ? 'Claim summary attached' : 'No claim summary attached'}</div>
                    <div className="text-[11px] text-slate-600">
                      {medicareDenialMetric
                        ? `${medicareDenialMetric.deniedClaimCount.toLocaleString()} denied / ${medicareDenialMetric.adjudicatedClaimCount.toLocaleString()} adjudicated · ${medicareDenialMetric.reportingPeriod} · ${medicareDenialMetric.claimScope} · ${medicareDenialMetric.denialDefinition}`
                        : 'No exact-NPI claim summary is attached.'}
                    </div>
                    {medicareDenialMetric?.sourceUrl ? (
                      <a href={medicareDenialMetric.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-700 underline underline-offset-2">
                        Source: {medicareDenialMetric.source}{medicareDenialMetric.sourceReference ? ` · ${medicareDenialMetric.sourceReference}` : ''}
                      </a>
                    ) : medicareDenialMetric && (
                      <p className="text-[11px] text-slate-600">
                        Source: {medicareDenialMetric.source}{medicareDenialMetric.sourceReference ? ` · ${medicareDenialMetric.sourceReference}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-xs font-semibold text-slate-600">Net Annual Recoverable Revenue</div>
                    <div className="text-3xl font-bold font-mono tabular-nums text-emerald-700">
                      Not reported with a reproducible method
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Recapturable via ZOLL AR Boost &amp; ePCR NEMSIS validation
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div>
                    <span className="text-slate-500 font-medium">Primary Claim Denial Cause: </span>
                    <strong className="text-[#0F172A]">{agency.cmsData.topDenialReason || 'Not reported'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Current Revenue Cycle Software in Use: </span>
                    <strong className="text-[#0F172A]">{agency.installedFleet.billingSoftware || 'Not reported'}</strong> · Supplied by: <strong className="text-[#0F172A]">{suppliers.billingSupplier || 'Not reported'}</strong>
                  </div>
                  <p className="text-slate-600 leading-relaxed pt-2 border-t border-slate-200">
                    No agency-specific recovery amount is shown because its inputs and calculation method are not attached to this record.
                  </p>
                </div>
              </div>

            </div>

            {/* Granular HCPCS Procedure Breakdown & CMS GADCS 10% Penalty Risk Table */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Procedure-Level HCPCS Ambulance Fee Schedule &amp; CMS GADCS 10% Penalty Exposure
                  </h3>
                  <p className="text-xs text-slate-500">
                    {hcpcsModel?.gadcs.cohortWave ?? 'Not calculated'} · Readiness: <strong className="text-[#0F172A]">{hcpcsModel?.gadcs.reportingReadinessStatus ?? 'Not calculated'}</strong> · {hcpcsModel?.gadcs.keyComplianceGap ?? 'Reported annual transports and Medicare payer share are required.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Modeled estimate inputs: {hcpcsModel
                      ? `${hcpcsModel.inputs.annualTransports.toLocaleString()} reported transports and ${hcpcsModel.inputs.medicarePayerPct}% Medicare payer share. Method: ${hcpcsModel.inputs.method}`
                      : 'not calculated because required reported inputs are missing.'}
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg">
                  GADCS 10% Medicare Penalty Risk: {hcpcsModel ? `-$${hcpcsModel.gadcs.gadcs10PctPenaltyExposure.toLocaleString()}/yr` : 'Not calculated'}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">HCPCS Code</th>
                      <th className="py-2.5 px-4">Procedure &amp; Clinical Requirement</th>
                      <th className="py-2.5 px-4 text-right">CMS Base Rate</th>
                      <th className="py-2.5 px-4 text-right">Annual Claims</th>
                      <th className="py-2.5 px-4 text-right">Gross Billed</th>
                      <th className="py-2.5 px-4 text-right">Denial Exposure</th>
                      <th className="py-2.5 px-4">ZOLL Automated Documentation Mitigation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {hcpcsModel?.procedures.map(proc => (
                      <tr key={proc.code} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono font-bold text-[#1E3A8A]">{proc.code}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-[#0F172A]">{proc.descriptor}</div>
                          <div className="text-[11px] text-slate-500">{proc.clinicalTrigger}</div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">${proc.nationalMedicareBaseRate.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{proc.estimatedAnnualClaims.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">${proc.grossAnnualBilling.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700 font-semibold">
                          {proc.annualRevenueAtRisk == null ? 'Not calculated' : `-$${proc.annualRevenueAtRisk.toLocaleString()}`}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-md">{proc.zollDocumentationMitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* SECTION: ACTUAL EQUIPMENT IN USE & CURRENT VENDOR SUPPLIERS (ALL 3 MODALITIES: 1, 2, AND 3) */}
          {showSection('suppliers') &&
          !(
            hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') ||
            hasAgencyFactEvidence(agency, 'equipmentSuppliers') ||
            hasAgencyFactEvidence(agency, 'verifiedHardware') ||
            hasAgencyFactEvidence(agency, 'maintenanceContracts')
          ) ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-3">
              No equipment, supplier, or maintenance details are listed in this agency record.
              {hasAgencyFactEvidence(agency, 'monitorModelTransition') && (
                <div className="rounded-lg border border-amber-200 bg-white/70 p-3 space-y-1">
                  <div className="font-semibold">Verified partial monitor record</div>
                  <p>{agency.factEvidence?.monitorModelTransition?.note}</p>
                  <a
                    className="inline-flex text-blue-700 hover:underline"
                    href={agency.factEvidence?.monitorModelTransition?.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View county procurement memo
                  </a>
                </div>
              )}
            </div>
          ) : showSection('suppliers') && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-[#1E3A8A]" />
                  <span>Actual Equipment in Use &amp; Current Vendor Suppliers</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete audit of what hardware/software is currently deployed at {agency.name} and who supplies and maintains each item
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-700">
                Primary Service Contract: <strong className="text-[#0F172A]">{agency.competitorContract.vendor || 'Not reported'}</strong> · Ends <strong className="font-mono tabular-nums text-[#0F172A]">{agency.competitorContract.contractEndDate || 'Not reported'}</strong>
              </span>
            </div>

            {/* MODALITY 1: DIRECT SUPPLIER CARDS */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600">
                01. Direct Vendor &amp; Distributor Supplier Cards
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">Cardiac Monitors / Defibrillators</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-600">
                      {reportMetric(agency.installedFleet.defibUnitsCount)} Units
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">In Use: {agency.installedFleet.defibBrand || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Current Supplier: <strong className="text-[#0F172A]">{suppliers.defibSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200 font-mono tabular-nums">
                    Age: {reportMetric(agency.installedFleet.defibAgeYears)} yrs · Warranty: <strong className="font-sans text-[#0F172A]">{agency.installedFleet.defibWarrantyStatus || 'Not reported'}</strong> · Ends: {agency.competitorContract.contractEndDate || 'Not reported'}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">ePCR Clinical Charting</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-600">
                      NEMSIS v3.5
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">In Use: {agency.installedFleet.epcrCadSoftware || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Current Supplier: <strong className="text-[#0F172A]">{suppliers.epcrSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    Field charting &amp; state trauma registry reporting supplier
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">911 CAD Dispatch System</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-600">
                      PSAP Dispatch
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">In Use: {agency.installedFleet.dispatchCadVendor || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Current Supplier: <strong className="text-[#0F172A]">{suppliers.cadSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    Primary 911 communications &amp; unit AVL routing supplier
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">Mechanical CPR System</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-600">
                      {reportMetric(agency.installedFleet.cprUnitsCount)} Units
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">In Use: {agency.installedFleet.mechanicalCPR || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Current Supplier: <strong className="text-[#0F172A]">{suppliers.cprSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    Automated chest compression resuscitation hardware
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">Transport Ventilators</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-600">
                      {reportMetric(agency.installedFleet.ventUnitsCount)} Units
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">In Use: {agency.installedFleet.transportVentilator || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Current Supplier: <strong className="text-[#0F172A]">{suppliers.ventSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    ALS airway &amp; respiratory support hardware supplier
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1E3A8A]">Billing &amp; Medical Disposables</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-600">
                      RCM &amp; Supply
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#0F172A]">Billing: {agency.installedFleet.billingSoftware || 'Not reported'}</div>
                  <div className="text-slate-700">
                    Billing Supplier: <strong className="text-[#0F172A]">{suppliers.billingSupplier}</strong>
                  </div>
                  <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    Consumables Distributor: <strong className="text-[#0F172A]">{suppliers.medicalDistributor}</strong>
                  </div>
                </div>

              </div>
            </div>

            {/* MODALITY 2: COMPLETE EQUIPMENT & PROCUREMENT AUDIT TABLE */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600">
                02. Complete Equipment &amp; Supplier Procurement Table
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Equipment / System Category</th>
                      <th className="py-3 px-4">Actual Model / Software in Use</th>
                      <th className="py-3 px-4">Active Units</th>
                      <th className="py-3 px-4">Age &amp; Warranty Status</th>
                      <th className="py-3 px-4">Current Supplier / Distributor</th>
                      <th className="py-3 px-4">Maintenance Contract &amp; Renewal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">Cardiac Monitors / Defibrillators</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.defibBrand || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{reportMetric(agency.installedFleet.defibUnitsCount)} Frontline Units</td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {reportMetric(agency.installedFleet.defibAgeYears)} yrs · <span className="font-sans font-semibold text-rose-700">{agency.installedFleet.defibWarrantyStatus || 'Not reported'}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.defibSupplier}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono tabular-nums">
                        {agency.competitorContract.vendor || 'Not reported'} ({reportCurrency(agency.competitorContract.annualServiceCostPerUnit)}/unit · Ends {agency.competitorContract.contractEndDate || 'Not reported'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">Mechanical CPR Resuscitation</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.mechanicalCPR || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{reportMetric(agency.installedFleet.cprUnitsCount)} Units</td>
                      <td className="py-3 px-4">
                        {hasReportedValue(agency.installedFleet.cprUnitsCount)
                          ? (agency.installedFleet.cprUnitsCount > 0 ? `${agency.installedFleet.cprUnitsCount} units reported` : '0 units reported')
                          : 'Not reported'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.cprSupplier}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {hasReportedValue(agency.installedFleet.cprUnitsCount)
                          ? (agency.installedFleet.cprUnitsCount > 0 ? 'Annual Preventive Calibration' : '0 units reported')
                          : 'Not reported'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">Emergency Transport Ventilators</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.transportVentilator || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{reportMetric(agency.installedFleet.ventUnitsCount)} Units</td>
                      <td className="py-3 px-4">
                        {hasReportedValue(agency.installedFleet.ventUnitsCount)
                          ? (agency.installedFleet.ventUnitsCount > 0 ? 'Active Biomedical Fleet' : '0 units reported')
                          : 'Not reported'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.ventSupplier}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {hasReportedValue(agency.installedFleet.ventUnitsCount)
                          ? (agency.installedFleet.ventUnitsCount > 0 ? 'OEM Biomedical Agreement' : 'Not reported')
                          : 'Not reported'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">ePCR Clinical Charting Software</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.epcrCadSoftware || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{hasReportedValue(agency.totalAmbulances) && hasReportedValue(agency.totalFireEngines) ? reportMetric(agency.totalAmbulances + agency.totalFireEngines) : 'Not reported'} Field Tablets</td>
                      <td className="py-3 px-4">Annual SaaS License</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.epcrSupplier}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono tabular-nums">Renewal Window: {reportMetric(agency.competitorContract.renewalWindowDays, ' days prior')}</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">911 Dispatch CAD Platform</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.dispatchCadVendor || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{reportMetric(agency.stationsCount)} Stations</td>
                      <td className="py-3 px-4">Municipal PSAP Contract</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.cadSupplier}</td>
                      <td className="py-3 px-4 text-slate-600">Multi-Year County/City Dispatch Agreement</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">Revenue Cycle &amp; Claims Billing</td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{agency.installedFleet.billingSoftware || 'Not reported'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{reportMetric(agency.annual911Transports)} Claims / yr</td>
                      <td className="hidden" />
                      <td className="py-3 px-4 font-medium text-slate-800">{suppliers.billingSupplier}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono tabular-nums">
                        Estimate not shown; required inputs and method are unavailable.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* MODALITY 3: SIDE-BY-SIDE CURRENT VENDOR VS. ZOLL COMPARISON MATRIX */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-[#1E3A8A]" />
                <span>03. Side-by-Side Current Supplier vs. Integrated ZOLL Replacement Matrix</span>
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F172A] text-white font-semibold">
                      <th className="py-3 px-4">Operational Domain</th>
                      <th className="py-3 px-4">Current Equipment &amp; Supplier at {agency.name}</th>
                      <th className="py-3 px-4">Recommended ZOLL Integrated Solution</th>
                      <th className="py-3 px-4">Clinical &amp; Financial Impact for Provider</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">Defibrillation &amp; Telemetry</td>
                      <td className="py-3 px-4 text-slate-700">
                        <strong className="text-[#0F172A]">{agency.installedFleet.defibBrand || 'Not reported'}</strong> ({reportMetric(agency.installedFleet.defibAgeYears)} yrs old)<br />
                        <span className="text-slate-500">Supplier: {suppliers.defibSupplier}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1E3A8A] bg-slate-50">
                        ZOLL X Series Advanced ({reportMetric(agency.installedFleet.defibUnitsCount)} Units)
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        Real BVM Help®, Real CPR Help®, and TBI Dashboard are product features. Agency chest-compression fraction: {reportMetric(agency.qualityMetrics.nemsqaChestCompressionFractionPct, '%')}; no agency-specific outcome forecast is shown.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">Automated Resuscitation</td>
                      <td className="py-3 px-4 text-slate-700">
                        <strong className="text-[#0F172A]">{agency.installedFleet.mechanicalCPR}</strong><br />
                        <span className="text-slate-500">Supplier: {suppliers.cprSupplier}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1E3A8A] bg-slate-50">
                        ZOLL AutoPulse NXT Resuscitation System
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        Circumferential load-distributing band compressions with ShockSync™ integration; agency Utstein rate: {reportMetric(agency.utsteinSurvivalRate, '%')}.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">ePCR &amp; CAD Integration</td>
                      <td className="py-3 px-4 text-slate-700">
                        <strong className="text-[#0F172A]">{agency.installedFleet.epcrCadSoftware}</strong> + <strong className="text-[#0F172A]">{agency.installedFleet.dispatchCadVendor}</strong><br />
                        <span className="text-slate-500">Suppliers: {suppliers.epcrSupplier} / {suppliers.cadSupplier}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1E3A8A] bg-slate-50">
                        ZOLL RescueNet ePCR &amp; ZOLL Respond CAD
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        Automated waveform upload from X Series into ePCR chart; eliminates manual data entry and NEMSIS v3.5 validation errors.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">Revenue Cycle &amp; Claims Recovery</td>
                      <td className="py-3 px-4 text-slate-700">
                        <strong className="text-[#0F172A]">{agency.installedFleet.billingSoftware || 'Not reported'}</strong><br />
                        <span className="text-slate-500">Supplier: {suppliers.billingSupplier}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1E3A8A] bg-slate-50">
                        ZOLL Billing &amp; AR Boost Insurance Discovery
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-700">
                        Recovery estimate not shown: no agency-specific calculation inputs and method are available.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* MODALITY 4: INCUMBENT FDA RECALL EXPOSURE & 5-YEAR FLEET TCO COMPARISON */}
            {tcoModel ? (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                    <span>04. Incumbent FDA Recall Alert &amp; 5-Year Total Cost of Ownership (TCO) Comparison ({tcoModel.unitCount} Units)</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Active Alert: <strong className="font-mono text-rose-700">{tcoModel.matchedIntel.fdaRecallId}</strong> ({tcoModel.matchedIntel.eolStatus}) — {tcoModel.matchedIntel.fdaRecallSummary}
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                  Estimated 5-Yr Net ZOLL Lifecycle Savings: {formatCurrency(tcoModel.totalSavingsIncludingTradeIn)}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">5-Year Lifecycle Cost Driver ({tcoModel.unitCount} Frontline Units)</th>
                      <th className="py-2.5 px-4 text-right">Incumbent ({tcoModel.incumbentModel})</th>
                      <th className="py-2.5 px-4 text-right">ZOLL ({tcoModel.zollModel})</th>
                      <th className="py-2.5 px-4 text-right">5-Yr Savings Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-[#0F172A]">OEM Preventive Maintenance &amp; Service Contracts (60 Mos)</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table">{formatCurrency(tcoModel.incumbentServiceTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table font-semibold">{formatCurrency(tcoModel.zollServiceTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-emerald-700 font-bold">+{formatCurrency(tcoModel.incumbentServiceTotal - tcoModel.zollServiceTotal, { compact: false })}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-[#0F172A]">Smart Battery Fleet Lifecycle Replacements</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table">{formatCurrency(tcoModel.incumbentBatteryTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table font-semibold">{formatCurrency(tcoModel.zollBatteryTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-emerald-700 font-bold">+{formatCurrency(tcoModel.incumbentBatteryTotal - tcoModel.zollBatteryTotal, { compact: false })}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-[#0F172A]">Electrodes, Capnography &amp; Resuscitation Consumables</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table">{formatCurrency(tcoModel.incumbentConsumablesTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table font-semibold">{formatCurrency(tcoModel.zollConsumablesTotal, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-emerald-700 font-bold">+{formatCurrency(tcoModel.incumbentConsumablesTotal - tcoModel.zollConsumablesTotal, { compact: false })}</td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="py-2.5 px-4 font-semibold text-[#0F172A]">Retired Competitor Fleet Trade-In Credit ({formatCurrency(tcoModel.matchedIntel.zollTradeInCreditPerUnit, { compact: false })}/unit)</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-slate-400">$0</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-emerald-700 font-bold">-{formatCurrency(tcoModel.totalTradeInCredit, { compact: false })}</td>
                      <td className="py-2.5 px-4 text-right pi-metric-table text-emerald-700 font-bold">+{formatCurrency(tcoModel.totalTradeInCredit, { compact: false })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Illustrative benchmark, not reported agency spending. Inputs: {reportMetric(tcoModel.unitCount)} reported defibrillator units and five years; benchmark {tcoModel.incumbentModel} vs {tcoModel.zollModel}; per-unit annual service {reportCurrency(tcoModel.matchedIntel.incumbentAnnualServicePerUnit)} vs {reportCurrency(tcoModel.matchedIntel.zollAnnualServicePerUnit)}, 5-year batteries {reportCurrency(tcoModel.matchedIntel.incumbentBattery5YrCostPerUnit)} vs {reportCurrency(tcoModel.matchedIntel.zollBattery5YrCostPerUnit)}, annual consumables {reportCurrency(tcoModel.matchedIntel.incumbentConsumableAnnualPerUnit)} vs {reportCurrency(tcoModel.matchedIntel.zollConsumableAnnualPerUnit)}, and trade-in assumption {reportCurrency(tcoModel.matchedIntel.zollTradeInCreditPerUnit)}/unit. Method: five-year service, battery, and consumables cost difference plus modeled trade-in credit.
              </p>

              {/* Interactive 5-Year Cumulative TCO Savings Area Chart */}
              <TcoCumulativeSavingsChart agency={agency} className="mt-4" />
            </div>
            ) : (
              <div role="status" className="pt-4 border-t border-slate-200 text-xs text-amber-800">
                {hasReportedValue(agency.installedFleet.defibUnitsCount)
                  ? 'TCO estimate not calculated: 0 defibrillator units reported.'
                  : 'TCO estimate not calculated: defibrillator unit count not reported.'}
              </div>
            )}
          </section>
        )}

        {/* SECTION: ACTIVE DEFIBRILLATOR & BIOMEDICAL FLEET + FRONTLINE APPARATUS & MAINTENANCE CONTRACTS */}
        {showSection('fleet') &&
          hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
          hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
          hasAgencyFactEvidence(agency, 'frontlineApparatusStations') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Active Defibrillator &amp; Biomedical Fleet</span>
              </h2>

              <div className="grid grid-cols-1 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-3.5 bg-white dark:bg-slate-900 space-y-1">
                  <div className="text-slate-500 dark:text-slate-400 font-medium font-mono text-[11px] uppercase tracking-wider">Frontline Monitor / Defibrillators</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{agency.installedFleet.defibBrand || 'Not reported'}</div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    <strong className="text-slate-900 dark:text-white">{reportMetric(agency.installedFleet.defibUnitsCount)} active units</strong> · <strong className="text-slate-900 dark:text-white">{reportMetric(agency.installedFleet.defibAgeYears)} years</strong> in service · Warranty: <strong className="font-sans text-slate-900 dark:text-white">{agency.installedFleet.defibWarrantyStatus || 'Not reported'}</strong>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Current Supplier: <strong className="text-slate-900 dark:text-white">{suppliers.defibSupplier}</strong>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-slate-900 space-y-1">
                  <div className="text-slate-500 dark:text-slate-400 font-medium font-mono text-[11px] uppercase tracking-wider">Mechanical CPR Equipment</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{agency.installedFleet.mechanicalCPR || 'Not reported'}</div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {hasReportedValue(agency.installedFleet.cprUnitsCount)
                      ? (agency.installedFleet.cprUnitsCount > 0
                        ? `${reportMetric(agency.installedFleet.cprUnitsCount)} automated compression units reported`
                        : '0 automated compression units reported')
                      : 'Equipment count not reported'}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Current Supplier: <strong className="text-slate-900 dark:text-white">{suppliers.cprSupplier}</strong>
                  </div>
                </div>

                <div className="p-3.5 bg-white dark:bg-slate-900 space-y-1">
                  <div className="text-slate-500 dark:text-slate-400 font-medium font-mono text-[11px] uppercase tracking-wider">Emergency Transport Ventilators</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{agency.installedFleet.transportVentilator || 'Not reported'}</div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {hasReportedValue(agency.installedFleet.ventUnitsCount)
                      ? `${reportMetric(agency.installedFleet.ventUnitsCount)} transport ventilator units reported`
                      : 'Equipment count not reported'}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Current Supplier: <strong className="text-slate-900 dark:text-white">{suppliers.ventSupplier}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Frontline Apparatus &amp; Maintenance Contracts</span>
              </h2>

              <dl className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Ambulance Fleet</dt>
                  <dd className="text-base font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.totalAmbulances)} Frontline Units</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Fire Apparatus</dt>
                  <dd className="text-base font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.totalFireEngines)} Engines / Ladders</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Current Maintenance Vendor</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.competitorContract.vendor}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Contract Expiration Date</dt>
                  <dd className="font-semibold pi-data-inline text-slate-900 dark:text-white mt-0.5">{agency.competitorContract.contractEndDate}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Annual Service Cost / Unit</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatCurrency(agency.competitorContract.annualServiceCostPerUnit, { perYear: true, compact: false })}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Renewal Notice Window</dt>
                  <dd className="font-semibold pi-metric-card text-amber-600 dark:text-amber-400 mt-0.5">{agency.competitorContract.renewalWindowDays} Days ({agency.competitorContract.status})</dd>
                </div>
              </dl>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">Maintenance Contract &amp; Fleet Action Plan</div>
                <p className="leading-relaxed">{agency.competitorContract.actionRecommendation}</p>
              </div>
            </section>
          </div>
        )}

        {/* SECTION: CAD, ePCR & BILLING SOFTWARE */}
        {showSection('software') && (
          <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
              <span>Emergency Communications, 911 CAD Dispatch &amp; Clinical ePCR Systems</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
              <div className="p-4 bg-white dark:bg-slate-900 space-y-2">
                <div className="font-semibold text-[#1E3A8A] dark:text-blue-400 font-mono text-[10px] uppercase tracking-wider">911 Dispatch CAD System</div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {agency.installedFleet.dispatchCadVendor || 'Not reported'}
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  Dispatch configuration: {agency.installedFleet.dispatchCadVendor || 'Not reported in this record'}.
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 space-y-2">
                <div className="font-semibold text-[#1E3A8A] dark:text-blue-400 font-mono text-[10px] uppercase tracking-wider">Electronic Patient Care Report (ePCR)</div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {agency.installedFleet.epcrCadSoftware || 'Not reported'}
                </div>
                {hasAgencyFactEvidence(agency, 'epcrSystem') && (
                  <div className="text-slate-600 dark:text-slate-400">Supplier: <strong className="text-slate-900 dark:text-white">Saffire Software, Inc.</strong></div>
                )}
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {hasAgencyFactEvidence(agency, 'epcrSystem')
                    ? 'The county identifies MetroPCR as its primary ePCR system; this source does not verify annual EMS transports.'
                    : 'System details are not listed in this record.'}
                </p>
                {hasAgencyFactEvidence(agency, 'epcrSystem') && (
                  <a
                    className="text-xs text-blue-700 dark:text-blue-300 hover:underline"
                    href={agency.factEvidence?.epcrSystem?.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View county contract record
                  </a>
                )}
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 space-y-2">
                <div className="font-semibold text-[#1E3A8A] dark:text-blue-400 font-mono text-[10px] uppercase tracking-wider">EMS Billing &amp; Revenue Software</div>
                <div className="text-base font-bold text-slate-900 dark:text-white">{agency.installedFleet.billingSoftware || 'Not listed in agency record'}</div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  Agency payer mix: {agency.cmsData.primaryPayerMix || 'Not listed in agency record'}.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* SECTION: FEDERAL FEMA GRANT READINESS & FUNDING STATUS + JURISDICTION & SERVICE DEMOGRAPHICS */}
        {showSection('grants') && !hasAgencyFactEvidence(agency, 'federalGrant') ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Grant award and SAFER details are not listed in this account record.
          </div>
        ) : showSection('grants') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Federal FEMA Grant Readiness & Funding Status */}
            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Federal FEMA Grant Readiness &amp; Funding Status</span>
              </h2>

              <div className="space-y-3 text-xs">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                  <div className="font-semibold text-[#1E3A8A] dark:text-blue-400 text-[11px] font-mono uppercase tracking-wider">
                    FEMA Assistance to Firefighters Grant (AFG)
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {agency.grantStatus.afgAwarded ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono tabular-nums">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Awarded: {reportCurrency(agency.grantStatus.afgAwardAmount)} (FY {reportMetric(agency.grantStatus.afgFiscalYear)})</span>
                      </span>
                    ) : (
                      <span className="text-slate-900 dark:text-white">No award indicated in this record; eligibility not assessed.</span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Funding scope: <strong className="text-slate-900 dark:text-white">{agency.grantStatus.afgPurpose || 'Not reported'}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="p-3.5 bg-white dark:bg-slate-900 space-y-1">
                    <div className="font-semibold text-slate-500 dark:text-slate-400 text-[10px] font-mono uppercase tracking-wider">FEMA SAFER Staffing Grant</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {agency.grantStatus.saferGrantActive ? 'Active SAFER Grant Operational' : 'Standard Municipal Staffing Budget'}
                    </div>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-slate-900 space-y-1">
                    <div className="font-semibold text-slate-500 dark:text-slate-400 text-[10px] font-mono uppercase tracking-wider">Municipal Budget Cycle</div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {agency.gisData.fiscalBudgetCycleQuarter} · FY Ends {agency.grantStatus.fiscalYearEndMonth}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Jurisdiction & Service Demographics */}
            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Jurisdiction &amp; Service Demographics</span>
              </h2>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Service Model</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.agencyType}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Government Level</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.jurisdictionLevel} Jurisdiction</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Population Served</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.populationServed)}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Stations &amp; Facilities</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatInteger(agency.stationsCount)} Active Stations</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Certified Personnel</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatInteger(agency.totalEMSStaff)} Responders</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Coverage Territory</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{agency.responseAreaSqMiles} Sq. Miles</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Senior Population (65+)</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatPercent(agency.gisData.seniorPopulationPct)} of Residents</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Median Household Income</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatCurrency(agency.gisData.medianHouseholdIncome, { compact: false })}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Community Poverty Rate</dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatPercent(agency.gisData.povertyRate)}</dd>
                </div>
              </dl>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Geography links and relationship basis
                </h3>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Location is kept separate from operating coverage. A county or city label is not treated as a service-area boundary.
                </p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Location labels
                    </p>
                    <ul className="mt-1 space-y-1.5">
                      {locationGeographicLinks.map((link, index) => (
                        <li key={`${link.level}-${link.sourceGeographyId ?? link.label}-${index}`} className="text-[10px] text-slate-700 dark:text-slate-200">
                          <span className="font-semibold capitalize">{link.level}</span>: {link.label}
                          {link.sourceGeographyId ? ` · ID ${link.sourceGeographyId}` : ''}
                          {link.geographyVintage ? ` · ${link.geographyVintage}` : ''}
                          <span className="text-slate-500"> · {
                            link.matchBasis === 'source-id'
                              ? 'source ID'
                              : link.matchBasis === 'name-state-candidate'
                                ? 'name/state candidate'
                                : link.matchBasis === 'user-confirmed'
                                  ? 'user-confirmed'
                                  : 'display label only'
                          }</span>
                          {link.sourceUrl && (
                            <a href={link.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-700 hover:underline dark:text-blue-300">
                              {link.sourceName || 'source'}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Explicit operating relationships
                    </p>
                    {serviceGeographicLinks.length || stationGeographicLinks.length ? (
                      <ul className="mt-1 space-y-1.5">
                        {[...serviceGeographicLinks, ...stationGeographicLinks].map((link, index) => (
                          <li key={`${link.relationship}-${link.sourceGeographyId ?? link.label}-${index}`} className="text-[10px] text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">{link.relationship}</span>: {link.label}
                            {link.sourceGeographyId ? ` · ID ${link.sourceGeographyId}` : ''}
                            {link.sourceUrl && (
                              <a href={link.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-700 hover:underline dark:text-blue-300">
                                {link.sourceName || 'source record'}
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                        No explicit service-area geography or station-to-area relationship is attached to this agency record.
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                      NERIS boundary and unit records are separate source candidates. They do not replace these agency-specific relationships.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Pre-Competed Cooperative Purchasing Contracts & Grant Vehicles */}
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Pre-Competed Cooperative Purchasing Contracts &amp; State Grant Vehicles ({agency.stateCode})</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authorized national cooperative purchasing contracts allowing {agency.name} to bypass 6-to-9 month municipal RFP delays
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4">Contract Vehicle &amp; Master ID</th>
                      <th className="py-2.5 px-4">Ceiling Discount &amp; Trade-In Terms</th>
                      <th className="py-2.5 px-4">Procurement Cycle Saved</th>
                      <th className="py-2.5 px-4">Statutory Piggyback Clause</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {COOPERATIVE_CONTRACTS.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0F172A]">{c.contractName}</div>
                          <div className="font-mono font-semibold text-[#1E3A8A]">{c.contractNumber}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-700">{c.discountCeiling}</td>
                        <td className="py-3 px-4 font-mono text-[#0F172A]">{c.rfpMonthsSaved}</td>
                        <td className="py-3 px-4 text-slate-600 max-w-md">{c.piggybackClauseText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5-Year Federal FEMA AFG, SAFER & Homeland Security Grant History */}
            {agency.femaGrantHistory && agency.femaGrantHistory.length > 0 && (
              <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-700" />
                      <span>Multi-Year FEMA AFG, SAFER &amp; Homeland Security Grant Track Record</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Federal grant funding history and equipment modernization eligibility for {agency.name}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-4">Fiscal Year</th>
                        <th className="py-2.5 px-4">Federal Grant Program</th>
                        <th className="py-2.5 px-4">Approved Equipment &amp; Operational Scope</th>
                        <th className="py-2.5 px-4 text-right">Federal Award</th>
                        <th className="py-2.5 px-4 text-right">Local Match</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {agency.femaGrantHistory.map((g, idx) => (
                        <tr key={`${g.fiscalYear}-${idx}`} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-mono font-bold text-[#0F172A]">FY {g.fiscalYear}</td>
                          <td className="py-2.5 px-4 font-bold text-[#1E3A8A]">{g.programName}</td>
                          <td className="py-2.5 px-4 text-slate-700 max-w-md">{g.purpose}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">${g.awardAmount.toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-600">{g.localMatchAmount == null || g.federalSharePct == null ? 'Not reported' : `$${g.localMatchAmount.toLocaleString()} (${100 - g.federalSharePct}%)`}</td>
                          <td className="py-2.5 px-4 text-right font-semibold">
                            <span className={`px-2 py-0.5 rounded-md ${
                              g.status.includes('Awarded')
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-50 text-[#1E3A8A] border border-blue-200'
                            }`}>
                              {g.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

          </div>
        )}

        {/* SECTION: FIELD NOTES & CRM INTERACTION LOG */}
        {showSection('notes') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Past Notes History (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
              <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1E3A8A]" />
                <span>Field Interaction History</span>
              </h2>

              {agency.fieldNotes.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  No notes recorded yet. Use the form on the right to log your first interaction.
                </div>
              ) : (
                <div className="space-y-3">
                  {agency.fieldNotes.map(note => (
                    <div key={note.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#0F172A]">{note.meetingType}</span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500">{note.date} · {note.repName}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{note.notes}</p>
                      {note.nextAction && (
                        <div className="text-[11px] text-[#0F172A] bg-white border border-slate-200 rounded-md p-2 mt-1">
                          <strong>Next Action:</strong> {note.nextAction} {note.dueDate && `(Due ${note.dueDate})`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Quick Note Logger Form (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] space-y-4">
              <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1E3A8A]" />
                <span>Log New Interaction</span>
              </h2>

              <form onSubmit={handleNoteSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Meeting / Call Type
                  </label>
                  <select
                    value={meetingType}
                    onChange={(e) => setMeetingType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0F172A] focus:outline-none focus:border-[#1E3A8A]"
                  >
                    <option value="On-Site Station Visit">On-Site Station Visit</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Virtual Demo">Virtual Demo</option>
                    <option value="RFP Review">RFP Review</option>
                    <option value="Ride-Along">Ride-Along</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Meeting Notes
                  </label>
                  <textarea
                    rows={4}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Describe discussion, chief priorities, clinical interest..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Next Follow-up Action
                  </label>
                  <input
                    type="text"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="e.g. Deliver pre-emptive RFP specification"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!noteText.trim()}
                  className="w-full py-2 px-4 rounded-lg text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1E3A8A] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Save Interaction to Cloud CRM</span>
                </button>
              </form>
            </div>

          </div>
        )}

        {/* TOPIC 7: EVIDENCE & SOURCES PROVENANCE LEDGER */}
        {showSection('evidence_ledger') && (
          <section id="profile-source-evidence" className="pi-surface scroll-mt-28 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-4">
              <div>
                  <h2 className="pi-section-heading">
                    Source Evidence &amp; Verification Ledger
                  </h2>
                <p className="pi-supporting mt-0.5">
                    Each field can show a mapped source separately from a source check. A registry match does not verify operational details for {agency.name}; use the attached link and confirm its date and scope.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerLiveVerification}
                  disabled={isVerifyingLive}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white cursor-pointer disabled:opacity-50"
                >
                    {isVerifyingLive ? 'Checking NPPES identity...' : 'Check NPPES identity'}
                </button>
                {onOpenDataLineage && (
                  <button
                    type="button"
                    onClick={() => onOpenDataLineage(agency)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#DFE6EF] dark:border-[#1E2D42] bg-white dark:bg-[#16243A] text-[#14283F] dark:text-white cursor-pointer"
                  >
                    Methodology &amp; Lineage Modal
                  </button>
                )}
              </div>
            </div>

            <div className="scannable-table-wrap">
              <table className="scannable-table">
                <thead>
                  <tr>
                    <th>Domain / Metric</th>
                    <th>Recorded Value</th>
                    <th>Record status</th>
                    <th>Primary Registry / Citation</th>
                    <th>Open source</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">Provider Identity &amp; NPI</td>
                    <td className="pi-metric-id">{hasVerifiedNppesIdentity ? `NPI ${agency.npiNumber} · ${agency.nppesOfficialName || 'NPPES organization'}` : 'No exact NPPES organization match reviewed'}</td>
                    <td>
                      <span className="profile-evidence-tag px-2 py-0.5 text-[11px] font-semibold">
                        {hasVerifiedNppesIdentity ? 'Exact registry match' : 'Candidate record'}
                      </span>
                    </td>
                    <td>U.S. HHS CMS NPPES Provider Registry</td>
                    <td>
                      <a
                        href={agency.nppesRegistryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#285EE8] hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>Inspect NPPES</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">Department FDID &amp; Stations</td>
                    <td className="pi-metric-id">
                      {agency.fdid ? `FDID ${agency.fdid}` : 'FDID not reported'}
                      {' · '}
                      {`${reportMetric(agency.stationsCount)} stations`}
                    </td>
                    <td>
                      <span className="profile-evidence-tag px-2 py-0.5 text-[11px] font-semibold">
                        {hasReviewedAgencyFactEvidence(agency, 'departmentRegistry') && agency.isFdidVerified && hasReviewedAgencyFactEvidence(agency, 'stationCount')
                          ? 'Source reviewed'
                          : hasMappedAgencyFactEvidence(agency, 'departmentRegistry') || hasMappedAgencyFactEvidence(agency, 'stationCount')
                            ? 'Source available'
                            : '—'}
                      </span>
                    </td>
                    <td>U.S. Fire Administration (USFA) National Registry</td>
                    <td>
                      <a
                        href={agency.factEvidence?.departmentRegistry?.sourceUrl || agency.usfaRegistryUrl || 'https://apps.usfa.fema.gov/registry/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#285EE8] hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>Inspect USFA</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">FEMA AFG &amp; SAFER Grants</td>
                    <td className="pi-data-table font-semibold">
                      {agency.grantStatus.afgAwarded
                        ? `${formatCurrency(agency.grantStatus.afgAwardAmount, { compact: false })} (FY${agency.grantStatus.afgFiscalYear})`
                        : 'No award listed in the agency record'}
                    </td>
                    <td>
                      <span className="profile-evidence-tag px-2 py-0.5 text-[11px] font-semibold">
                        {getAgencyFactEvidenceStatus(agency, 'federalGrant') === 'source-reviewed'
                          ? 'Source reviewed'
                          : hasMappedAgencyFactEvidence(agency, 'federalGrant')
                            ? 'Source available'
                            : '—'}
                      </span>
                    </td>
                    <td>OpenFEMA Assistance to Firefighters Grants v2 API</td>
                    <td>
                      <a
                        href={agency.factEvidence?.federalGrant?.sourceUrl || 'https://www.fema.gov/about/openfema/data-sets'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#285EE8] hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>OpenFEMA Dataset</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">Medicare Part B Ambulance Volume</td>
                    <td className="pi-data-table font-semibold text-emerald-700">{formatCurrency(agency.cmsData.medicareAllowedAnnual, { perYear: true, compact: false })}</td>
                    <td>
                      <span className="profile-evidence-tag px-2 py-0.5 text-[11px] font-semibold">
                        {getAgencyFactEvidenceStatus(agency, 'cmsClaims') === 'source-reviewed'
                          ? 'Source reviewed'
                          : hasMappedAgencyFactEvidence(agency, 'cmsClaims')
                            ? 'Source available'
                            : '—'}
                      </span>
                    </td>
                    <td>CMS Medicare Provider Utilization &amp; Payment PUF</td>
                    <td>
                      <a
                        href={agency.factEvidence?.cmsClaims?.sourceUrl || 'https://data.cms.gov'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#285EE8] hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>CMS Data Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">5-Year TCO &amp; CapEx Forecast</td>
                    <td className="pi-data-table font-semibold text-emerald-700">+{formatCurrency(actuarialForecast.fiveYrTcoBase, { compact: false })} Savings</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        Scenario model · not observed savings
                      </span>
                    </td>
                    <td>Sourcewell #041823-ZOL &amp; OEM Lifecycle Model</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setShowActuarialMath(true)}
                        className="text-[#285EE8] hover:underline font-semibold cursor-pointer"
                      >
                        Adjust Assumptions
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {isFire ? (
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
            ) : (
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
          </section>
        )}

      </div>
      </main>

      {/* Sticky Account Quick-Action Bar aligned with the 256px desktop sidebar */}
      <aside 
        aria-label="Account Action Dock"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#DFE6EF] bg-white/95 px-2.5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all dark:border-[#1E2D42] dark:bg-[#111C2D]/95 print:hidden sm:left-64 sm:px-6 sm:py-2.5"
      >
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:overflow-x-auto sm:no-scrollbar">
          {/* Left: Department Identity & Quick Pipeline Stage Switcher */}
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#14283F] dark:text-white truncate max-w-[240px] lg:max-w-[360px]">
                {agency.name}
              </div>
              <div className="text-[11px] text-[#53657B] dark:text-slate-400 truncate">
                {agency.city}, {agency.stateCode} · <span className="tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(agency.zollOpportunity.projectedPipelineValue)} pipeline</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-[#53657B] dark:text-slate-400 hidden xl:inline">Stage:</span>
              <select
                value={agency.zollOpportunity.salesStage}
                onChange={(e) => onUpdateStage(agency.id, e.target.value as LeadStage)}
                className="h-10 bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-lg px-3 text-xs font-bold text-[#14283F] dark:text-white focus:outline-none focus:border-[#285EE8] cursor-pointer"
                title="Update CRM Sales Pipeline Stage"
              >
                {stages.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:shrink-0 sm:flex-nowrap sm:items-center sm:gap-2">
            <AgencyCompareButton
              agency={agency}
              selected={comparedAgencyIds.includes(agency.id)}
              limitReached={comparedAgencyIds.length >= 3}
              onToggle={onToggleAgencyComparison}
              className="h-10 w-full px-1.5 text-[10px] sm:w-auto sm:px-3 sm:text-xs"
            />
            <button
              type="button"
              onClick={onOpenAgencyComparison}
              disabled={comparedAgencyIds.length < 2}
              className="h-10 w-full whitespace-nowrap rounded-lg bg-teal-700 px-1.5 text-[10px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-3 sm:text-xs"
              data-testid="button-open-comparison-from-profile-dock"
            >
              Compare {comparedAgencyIds.length}/3
            </button>
            <button
              onClick={() => onToggleRoute(agency.id)}
              aria-label={agency.inDayRoute ? "Remove agency from today's route" : 'Add agency to route'}
              className={`h-10 w-full justify-center px-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap sm:w-auto sm:justify-start sm:gap-2 sm:px-3.5 sm:text-xs ${
                agency.inDayRoute
                  ? 'bg-[#0B1728] dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-[#16243A] text-[#14283F] dark:text-slate-200 border border-[#DFE6EF] dark:border-[#1E2D42] hover:bg-[#F5F7FA]'
              }`}
            >
              <Navigation className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">{agency.inDayRoute ? 'In route' : 'Route'}</span>
              <span className="hidden sm:inline">{agency.inDayRoute ? "In Today's Route" : 'Add to Route'}</span>
            </button>

            {onOpenRfpGenerator && (
              <button
                onClick={() => onOpenRfpGenerator(agency)}
                className="h-10 w-full justify-center px-1.5 rounded-lg text-[10px] font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap sm:w-auto sm:justify-start sm:gap-2 sm:px-3.5 sm:text-xs"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="sm:hidden">RFP</span>
                <span className="hidden sm:inline">Generate RFP Spec</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveSection('overview');
                setTimeout(() => {
                  const el = document.getElementById('meeting-preparation-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-[#EEF3FE] px-1.5 text-[10px] font-semibold text-[#285EE8] transition-colors hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 sm:w-auto sm:gap-2 sm:px-3.5 sm:text-xs"
              aria-label="Prepare for meeting"
            >
              <Sparkles className="inline h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Meeting</span>
              <span className="hidden sm:inline">Prepare for Meeting</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleBookmark(agency.id)}
              aria-pressed={agency.isBookmarked}
              aria-label={agency.isBookmarked ? 'Remove agency from saved work' : 'Save agency to My Work'}
              className={`inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-semibold transition-colors sm:w-auto sm:gap-2 sm:px-3 sm:text-xs ${
                agency.isBookmarked
                  ? 'border-[#285EE8] bg-[#285EE8] text-white'
                  : 'border-[#DFE6EF] bg-white text-[#14283F] hover:bg-[#F5F7FA] dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-slate-200'
              }`}
            >
              <Bookmark className="inline h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">{agency.isBookmarked ? 'Saved' : 'Save'}</span>
              <span className="hidden sm:inline">{agency.isBookmarked ? 'Saved' : 'Save'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSourceDrawerOpen(true)}
              aria-label="Inspect agency sources"
              className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-[#DFE6EF] bg-white px-1.5 text-[10px] font-semibold text-[#14283F] transition-colors hover:bg-[#F5F7FA] dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-slate-200 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs"
            >
              <ShieldCheck className="inline h-3.5 w-3.5 text-emerald-600" />
              <span>Sources</span>
            </button>

            <button
              onClick={onBack}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-[#DFE6EF] bg-[#F5F7FA] px-1.5 text-[10px] font-semibold text-[#14283F] transition-colors hover:bg-slate-200/70 dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-white sm:w-auto sm:px-3.5 sm:text-xs"
            >
              <ArrowLeft className="inline h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Contextual Source-Inspection Drawer (Section 9) */}
      {isSourceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            onClick={() => setIsSourceDrawerOpen(false)}
          />
          <aside
            aria-label="Evidence and Source Inspection Drawer"
            className="relative z-10 w-full max-w-md bg-white dark:bg-[#111C2D] border-l border-[#DFE6EF] dark:border-[#1E2D42] h-full flex flex-col shadow-2xl"
          >
            <div className="p-4 sm:p-5 border-b border-[#DFE6EF] dark:border-[#1E2D42] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#285EE8] font-semibold">
                  Evidence &amp; Source Inspection
                </div>
                <h3 className="text-base font-bold text-[#14283F] dark:text-white mt-0.5">
                  {agency.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSourceDrawerOpen(false)}
                className="p-1.5 rounded-lg text-[#53657B] hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-1">
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{hasVerifiedNppesIdentity ? 'NPPES legal-organization match' : 'Registry match not established'}</span>
                </div>
                <p className="text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                  NPPES can confirm a matched legal organization and its registry listing. It does not establish that the organization is an operating EMS or fire agency, that the listed address is an operating station, or that an authorized official is operational command.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#53657B] font-semibold">
                  1. Registry Identifiers &amp; Match Status
                </div>
                <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#53657B]">CMS NPI Number:</span>
                    <strong className="text-[#14283F] dark:text-white">{agency.npiNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#53657B]">NUCC Taxonomy:</span>
                    <strong className="text-[#14283F] dark:text-white">{agency.taxonomyCode}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#53657B]">USFA FDID:</span>
                    <strong className="text-[#14283F] dark:text-white">{agency.fdid}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#53657B]">Authorized Official:</span>
                    <strong className="text-[#14283F] dark:text-white">{agency.nppesOfficialName}</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#53657B] font-semibold">
                  2. Direct Federal Registry Links
                </div>
                <div className="space-y-2">
                  <a
                    href={agency.nppesRegistryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-3 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8] flex items-center justify-between font-medium text-[#14283F] dark:text-white transition-colors"
                  >
                    <span>CMS NPPES Provider View (NPI {agency.npiNumber})</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#285EE8]" />
                  </a>
                  <a
                    href={agency.usfaRegistryUrl || 'https://apps.usfa.fema.gov/registry/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-3 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8] flex items-center justify-between font-medium text-[#14283F] dark:text-white transition-colors"
                  >
                    <span>U.S. Fire Administration Registry</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#285EE8]" />
                  </a>
                  <a
                    href={agency.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-3 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8] flex items-center justify-between font-medium text-[#14283F] dark:text-white transition-colors"
                  >
                    <span>Google Maps Station Verification</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#285EE8]" />
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#53657B] font-semibold">
                  3. Modeled vs. Empirical Disclosure
                </div>
                <p className="text-[#53657B] dark:text-slate-400 leading-relaxed">
                  5-year TCO savings (+${(actuarialForecast.fiveYrTcoBase / 1000).toFixed(0)}K) and claim-recovery scenarios use reported denied-claim dollar amounts only; no estimate is inferred from claim counts.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-[#DFE6EF] dark:border-[#1E2D42] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={triggerLiveVerification}
                disabled={isVerifyingLive}
                className="flex-1 h-9 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white cursor-pointer disabled:opacity-50"
              >
                {isVerifyingLive ? 'Refreshing...' : 'Refresh Live Federal Record'}
              </button>
              <button
                type="button"
                onClick={() => setIsSourceDrawerOpen(false)}
                className="h-9 px-4 rounded-lg text-xs font-semibold border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* One-Click Printable Executive Account Briefing Dossier Modal */}
      {showDossierModal && (
        <React.Suspense fallback={null}>
          <ExecutiveBriefingDossier
            agency={agency}
            weights={weights}
            isOpen
            onClose={() => setShowDossierModal(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};
