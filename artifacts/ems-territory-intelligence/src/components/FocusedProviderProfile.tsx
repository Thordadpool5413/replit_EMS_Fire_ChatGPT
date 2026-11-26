import { agencyIdentifierLabel, withoutGeneratedFdid, withoutUnsubstantiatedProspectContract } from '../utils/providerRecordTrust';
import { hasAgencyContractEvidence } from '../data/agencyFactEvidence';
import { ProfileContactDisclosure } from './profile/ProfileContactDisclosure';
import { AgencyIdentityStrip } from './profile/AgencyIdentityStrip';
import { DealDiscoveryWorkspace } from './profile/DealDiscoveryWorkspace';
import { FollowUpWorkspace } from './FollowUpWorkspace';
import type { FollowUpUpdater } from '../utils/followUps';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MISSING_INPUT_COPY } from '../utils/missingInputCopy';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { ScrollableTableRegion } from './ScrollableTableRegion';
import {
  COOPERATIVE_CONTRACTS,
  calculateAgencyFleetTco,
  calculateAgencyHcpcsBreakdown,
  getAgencyClinicalProtocolAlignment
} from '../data/clinicalAndCompetitiveIntelligence';
import { validateNpiCheckDigit } from '../services/npiVerificationService';
import { getAgencyMedicareDenialMetricForDisplay } from '../services/agencyMedicareDenialService';
import { getAgencyGeographicLinks } from '../services/geographicMappingService';
import { PrivateCoordinateMap } from './profile/PrivateCoordinateMap';
import { TexasProfileLocationEvidence } from './profile/TexasHistoricalLocationEvidence';
import { saveAgencyProfileReviewedAt } from '../services/agencyProfileReviewStore';
import { ClinicalMeasures } from './profile/ClinicalMeasures';
import { EmsRegistryLookup } from './EmsRegistryLookup';
import { FireRegistryLookup } from './FireRegistryLookup';
import { AgencySourceRecordWorkspace } from './AgencySourceRecordWorkspace';
import AgencyIntelligenceOverview from './AgencyIntelligenceOverview';
import { AgencyCompareButton } from './AgencyCompareButton';
import { PlanningValueDisclosure } from './PlanningValueDisclosure';
import { AgencyIntelligenceBrief, getAgencyServiceMode } from './profile/AgencyIntelligenceBrief';
import { PreCallPlanner } from './profile/PreCallPlanner';
import { ReviewedPreCallPlanner } from './profile/ReviewedPreCallPlanner';
import { ProviderAddressLine } from './profile/ProviderAddressLine';
import { DepartmentFacilities } from './profile/DepartmentFacilities';
import { ProviderIntelligenceCoverage } from './profile/ProviderIntelligenceCoverage';
import { displayedProviderLocation,useLocationRevision,locationDirections,providerAddressReview } from '../services/providerLocation';
import { ProviderCompetitiveProfile } from './profile/ProviderCompetitiveProfile';
import { ProfileCommandOverview } from './profile/ProfileCommandOverview';
import { ProfileAttentionSummary } from './profile/ProfileAttentionSummary';
import { ProfileDetail } from './profile/ProfileDetail';
import { DecisionMakerDirectory } from './profile/DecisionMakerDirectory';
import { AgencyAuthorityEvidence } from './profile/AgencyAuthorityEvidence';
import { FieldNotesPanel } from './profile/FieldNotesPanel';
import { ProcurementTimeline } from './profile/ProcurementTimeline';
import { ReviewedLifecycleTimeline } from './profile/ReviewedLifecycleTimeline';
import { FinancialIntelligence, matchBenchmarkModelId } from './profile/FinancialIntelligence';
import {CmsAmbulanceEvidencePanel} from './profile/CmsAmbulanceEvidencePanel';
import {NppesPracticeLocationsPanel} from './profile/NppesPracticeLocationsPanel';
import {NerisProfileStations} from './profile/NerisDepartmentStations';
import {UsfaProfileStations} from './profile/UsfaLegacyStations';
import { FactReviewPanel } from './profile/FactReviewPanel';
import { ADDRESS_CANDIDATE_FIELD } from '../services/addressCandidateValidation';
import type { AgencySourceRecordData } from '../services/agencySourceRecordStore';
import {
  formatCurrency,
  formatEquipmentDisplay,
  formatInteger,
  formatPercent,
  formatPriorityScore
} from '../utils/formatters';

interface FocusedProviderProfileProps {
  onCreateFollowUp: (id:string,task:FieldNote)=>Promise<void>;
  onUpdateFollowUp: FollowUpUpdater;
  agency: Agency;
  directoryAgencies?: Agency[];
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
}> = () => null;

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
  | 'activity'
  | 'overview'
  | 'equipment'
  | 'purchasing'
  | 'decision_makers'
  | 'operations'
  | 'medicare'
  | 'meeting'
  | 'deal_story'
  | 'evidence';

const PRIMARY_PROFILE_IDS = ['overview','deal_story','equipment','decision_makers','purchasing','activity','evidence'];
const PROFILE_SECTIONS: Array<{ id: ProfileSection; label: string; short: string; purpose: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }> }> = [
  { id: 'activity', label: 'Activity & follow-up', short: 'Activity', purpose: 'Visit history, next actions, and notes. Unfinished notes are saved on this device.', icon: FileText },
  { id: 'overview', label: 'Overview', short: 'Overview', purpose: 'Start with recorded equipment, operating scale, key contacts and your next action.', icon: Layers },
      { id: 'equipment', label: 'Equipment & Technology', short: 'Equipment', purpose: 'Recorded devices, software, lifecycle, buy-back research and head-to-head comparison.', icon: Cpu },
  { id: 'purchasing', label: 'Purchasing & Funding', short: 'Purchasing', purpose: 'Contract and supplier records, procurement timing, cooperative vehicles and grant history. Past dates are history, not deadlines.', icon: Scale },
  { id: 'decision_makers', label: 'People & roles', short: 'People', purpose: 'Recorded leadership and purchasing authority with source context. Relationships are never inferred.', icon: UserCheck },
  { id: 'operations', label: 'Operations & Clinical', short: 'Ops & clinical', purpose: 'Operational scale, apparatus, receiving hospitals and source-supported clinical measures.', icon: Activity },
  { id: 'medicare', label: 'Financial Intelligence', short: 'Financial', purpose: 'Reported claims data separated from planning estimates. Assumptions are adjustable; projections are not agency outcomes.', icon: DollarSign },
  { id: 'meeting', label: 'Account findings & meeting preparation', short: 'Meeting prep', purpose: 'Evidence, confidence, cited signals and a practical meeting brief. Records are working references, not proof of buying intent.', icon: FileText },
  { id: 'deal_story', label: 'Visit plan', short: 'Visit plan', purpose: 'Prepare an agency-specific conversation, discovery questions and a clearly labeled planning comparison.', icon: Sparkles },
  { id: 'evidence', label: 'Sources', short: 'Sources', purpose: 'View source records, record notes and corrections, and inspect change history.', icon: FileCheck2 },
];

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
import { DataLabel } from './DataLabel';

/**
 * Guarantees complete agency fields for any selected EMS Provider or Fire Department
 * without ever injecting synthetic (555) phone numbers or fabricated staff emails.
 */
function ensureCompleteAgencyData(raw: Agency): Agency {
  raw = withoutUnsubstantiatedProspectContract(withoutGeneratedFdid(raw), hasAgencyContractEvidence(raw));
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
          email: c.email || '',
          phone: c.phone || '',
          officialWebsite: c.officialWebsite || '',
          headquartersAddress: c.headquartersAddress || '',
          isVerifiedOfficial: Boolean(
            c.isVerifiedOfficial &&
            hasAgencyFactEvidence(raw, 'agencyLeadership') &&
            hasAgencyFactEvidence(raw, 'decisionMakers')
          ),
          verificationSource: c.verificationSource || 'Source not listed',
          notes: c.notes || ''
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
        status: 'Award recorded — disbursement not reported' as const,
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
              status: 'Award recorded — disbursement not reported' as const,
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
    headquartersPhone: raw.headquartersPhone || '',
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
 * Inventory brand names do not identify an agency's contracted supplier.
 * No supplier fields are available in the current record.
 */
function resolveEquipmentSuppliers() {
  return {
    defibSupplier: 'Not reported',
    cprSupplier: 'Not reported',
    ventSupplier: 'Not reported',
    epcrSupplier: 'Not reported',
    cadSupplier: 'Not reported',
    billingSupplier: 'Not reported',
    medicalDistributor: 'Not reported',
  };
}

export const FocusedProviderProfile: React.FC<FocusedProviderProfileProps> = ({
  agency: rawAgency,
  directoryAgencies = [],
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
  onUpdateFollowUp,
  onCreateFollowUp,
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

  const locationRevision = useLocationRevision();
  const agency = useMemo(() => {
    const a=ensureCompleteAgencyData(rawAgency),loc=displayedProviderLocation(rawAgency,directoryAgencies);
    return loc?{...a,address:loc.address.street,city:loc.address.city,zipCode:loc.address.zip,googleMapsUri:locationDirections(loc),factEvidence:{...a.factEvidence,providerAddress:{reviewed:false,sourceKind:'dataset' as const,sourceName:loc.sourceName,sourceUrl:loc.sourceUrl,sourceRecordId:loc.identityKey,reportingPeriod:loc.sourceDate??undefined,geographicLevel:'agency' as const,note:loc.kind}}}:{...a,address:'',googleMapsUri:undefined};
  }, [rawAgency,directoryAgencies,locationRevision]);
  const suppliers = resolveEquipmentSuppliers();
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
  // Benchmark comparison only for a recorded model match, or a comparison model the user explicitly selects.
  const matchedBenchmarkId = useMemo(() => matchBenchmarkModelId(agency), [agency]);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | null>(null);
  const [includedUnits, setIncludedUnits] = useState<number | null>(null);
  useEffect(() => { setSelectedBenchmarkId(null); setIncludedUnits(null); }, [rawAgency.id]);
  const effectiveBenchmarkId = matchedBenchmarkId ?? selectedBenchmarkId;
  const reportedDefibUnits = agency.installedFleet.defibUnitsCount;
  const comparisonUnits = hasReportedValue(reportedDefibUnits) && Number.isInteger(reportedDefibUnits) && reportedDefibUnits > 0
    ? Math.min(reportedDefibUnits, includedUnits ?? reportedDefibUnits)
    : null;
  const tcoModel = useMemo(() => {
    if (comparisonUnits == null || comparisonUnits <= 0 || !effectiveBenchmarkId) return null;
    return calculateAgencyFleetTco(agency, 5, comparisonUnits, effectiveBenchmarkId);
  }, [agency, comparisonUnits, effectiveBenchmarkId]);
  const hcpcsModel = useMemo(() => calculateAgencyHcpcsBreakdown(agency), [agency]);
  const protocolModel = useMemo(() => getAgencyClinicalProtocolAlignment(agency), [agency]);

  // Default to Overview; every topic shares one accessible content region.
  const [requestedReviewField, setRequestedReviewField] = useState<string | undefined>();
  const [activeSection, setActiveSection] = useState<ProfileSection>('overview');
  // Measure the sticky profile header so the topic navigation docks directly beneath it
  // on every phone width and text size instead of relying on a fixed pixel guess.
  const profileRootRef = useRef<HTMLDivElement | null>(null);
  const profileHeaderRef = useRef<HTMLElement | null>(null);
  const profileTopicRef = useRef<HTMLDivElement | null>(null);
  const profileScrollFrameRef = useRef<number | null>(null);
  useEffect(() => {
    // Opening an agency from Search can leave the previous screen's search box
    // focused behind this full-screen dossier. Dismiss that stale keyboard so
    // the four phone actions are usable immediately.
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      !profileRootRef.current?.contains(focused) &&
      focused.matches('input, textarea, select, [contenteditable="true"]')
    ) {
      focused.blur();
    }
  }, []);
  useEffect(() => {
    profileRootRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    return () => {
      if (profileScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(profileScrollFrameRef.current);
        profileScrollFrameRef.current = null;
      }
    };
  }, [rawAgency.id]);
  useEffect(() => {
    const header = profileHeaderRef.current;
    const root = profileRootRef.current;
    if (!header || !root || typeof ResizeObserver === 'undefined') return;
    const apply = () => root.style.setProperty('--acp-sticky-header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState<boolean>(false);
  const [profileReviewError, setProfileReviewError] = useState('');
  const [profileDetailsHost, setProfileDetailsHost] = useState<HTMLDivElement | null>(null);
  const [compactOpening, setCompactOpening] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [contactOpen, setContactOpen] = useState(false);
  // FactReviewPanel announces unsaved review forms; leaving the section or profile asks first.
  const reviewDirtyRef = React.useRef(false);
  useEffect(() => {
    const onDirty = (event: Event) => { reviewDirtyRef.current = Boolean((event as CustomEvent<boolean>).detail); };
    window.addEventListener('agency-profile-review-dirty', onDirty);
    return () => window.removeEventListener('agency-profile-review-dirty', onDirty);
  }, []);
  useEffect(() => { reviewDirtyRef.current = false; }, [rawAgency.id]);
  const confirmLeaveReview = () => {
    if (!reviewDirtyRef.current) return true;
    if (!window.confirm('You have an unsaved fact review. Discard it?')) return false;
    reviewDirtyRef.current = false;
    return true;
  };
  const guardedBack = () => { if (confirmLeaveReview()) onBack(); };
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setCompactOpening(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const markProfileReviewed = () => {
    if (!saveAgencyProfileReviewedAt(agency.id, new Date().toISOString())) {
      setProfileReviewError('This browser could not save the review marker. The agency data was not changed.');
      return;
    }
    setProfileReviewError('');
  };

  // Interactive Actuarial Forecasting Sensitivity Controls (Low / Base / High Confidence Intervals)
  const [customUnitMsrp, setCustomUnitMsrp] = useState<number>(38500);
  const [customTradeInCredit, setCustomTradeInCredit] = useState<number>(4000);
  const [customDenialCapturePct, setCustomDenialCapturePct] = useState<number>(65);
  useEffect(() => {
    setActiveSection('overview');
    setCustomUnitMsrp(38500); setCustomTradeInCredit(4000); setCustomDenialCapturePct(65);
    setContactOpen(false); setShowDossierModal(false); setIsSourceDrawerOpen(false);
  }, [rawAgency.id]);

  const profileServiceMode = getAgencyServiceMode(agency);
  const isFire = profileServiceMode !== 'ems';
  const latestSourcePeriod = useMemo(() => {
    const periods = Object.values(agency.factEvidence ?? {})
      .map((e) => e?.reportingPeriod?.trim())
      .filter((p): p is string => Boolean(p));
    const unique = [...new Set(periods)];
    return unique.length > 1 ? 'multiple — see Evidence' : unique[0] ?? null;
  }, [agency]);
  const benchmarkIntel = useMemo(
    () => (matchedBenchmarkId ? calculateAgencyFleetTco(agency, 5, 0, matchedBenchmarkId).matchedIntel : null),
    [agency, matchedBenchmarkId],
  );
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
    const reportedUnitCount = comparisonUnits ?? undefined;
    const hasUnitCount = hasReportedValue(reportedUnitCount);
    const units = reportedUnitCount ?? 0;
    const grossCapExBase = units * customUnitMsrp;
    const totalTradeIn = units * Math.min(customTradeInCredit, customUnitMsrp);
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

    // Operating difference only; trade-in credit is already applied to net capital and is not counted twice.
    const fiveYrTcoBase = tcoModel?.fiveYearOperatingSavings ?? 0;
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
  }, [agency, comparisonUnits, customUnitMsrp, customTradeInCredit, customDenialCapturePct, tcoModel]);

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
      const data = response as unknown as {
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
        details: data.details ?? 'NPPES returned source records.',
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
        if (!reviewDirtyRef.current) onBack();
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

  const handlePrintBrief = () => {
    window.print();
  };

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
    ;

  const showSection = (
    sec:
      | 'battlecard'
      | 'leadership'
      | 'fleet'
      | 'apparatus'
      | 'software'
      | 'suppliers'
      | 'grants'
      | 'clinical'
      | 'billing'
      | 'notes'
      | 'evidence_ledger'
  ) => {
    // Each section belongs to exactly one profile topic, so no content group can render twice.
    if (activeSection === 'equipment') return sec === 'fleet' || sec === 'software' || sec === 'battlecard';
    if (activeSection === 'purchasing') return sec === 'suppliers' || sec === 'grants';
    if (activeSection === 'decision_makers') return sec === 'leadership';
    if (activeSection === 'operations') return sec === 'apparatus' || (sec === 'clinical' && profileServiceMode !== 'fire');
    if (activeSection === 'medicare') return sec === 'billing' && profileServiceMode !== 'fire';
    if (activeSection === 'activity') return sec === 'notes';
    if (activeSection === 'evidence') return sec === 'evidence_ledger';
    return false;
  };

  const changeSection = (section: ProfileSection) => {
    if (section === activeSection) return true;
    if (activeSection === 'evidence' && !confirmLeaveReview()) return false;
    setActiveSection(section);
    return true;
  };

  const navigateProfileSection = (section: ProfileSection, targetId?: string) => {
    if (!changeSection(section)) return false;
    if (profileScrollFrameRef.current !== null) window.cancelAnimationFrame(profileScrollFrameRef.current);
    // Mount the topic before positioning it below both sticky bars.
    // Native scrollIntoView used to put the first heading behind navigation.
    profileScrollFrameRef.current = window.requestAnimationFrame(() => {
      profileScrollFrameRef.current = window.requestAnimationFrame(() => {
        profileScrollFrameRef.current = null;
        const root = profileRootRef.current;
        const nav = root?.querySelector<HTMLElement>('[data-testid="profile-topic-navigation"]');
        const target = targetId ? root?.querySelector<HTMLElement>(`#${targetId}`) : profileTopicRef.current;
        if (!root || !target) return;
        const stickyHeight = (profileHeaderRef.current?.getBoundingClientRect().height ?? 0)
          + (nav?.getBoundingClientRect().height ?? 0);
        const top = root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - stickyHeight - 12;
        root.scrollTo({
          top: Math.max(0, top),
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      });
    });
    return true;
  };

  const openProfileSources = () => {
    navigateProfileSection('evidence', 'profile-source-evidence');
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
      whyItMatters: `Illustrative trade-in assumption: ${formatCurrency(customTradeInCredit)} per unit.`,
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
      whyItMatters: 'Review billing and documentation workflows; product features are not used to attribute an agency-specific recovery amount.',
      nextActionLabel: 'Inspect Medicare',
      targetTopic: 'medicare' as ProfileSection,
      sourceBadge: medicareDenialMetric?.source ?? 'Medicare claim summary'
    }
  ];

  // Comprehensive Evidence-Backed Account Assessment
  const accountAssessment = useMemo(() => {
    const hasGrant = Boolean(agency.grantStatus?.afgAwarded);
    const grantAmt = agency.grantStatus?.afgAwardAmount ?? 0;
    const defibBrand = agency.installedFleet?.defibBrand || 'Not reported';
    const defibAge = agency.installedFleet?.defibAgeYears;
    const contractEnd = agency.competitorContract?.contractEndDate || 'Not reported';
    const hasNotes = Array.isArray(agency.fieldNotes) && agency.fieldNotes.length > 0;
    const topNote = hasNotes ? agency.fieldNotes[0] : null;

    // 1. What Is Known About the Organization
    const whatIsKnown = [
      agency.address
        ? `Recorded address: ${agency.address} (source location; verify before visiting).`
        : 'Department address not reported in the record.',
      hasAgencyFactEvidence(agency, 'departmentRegistry')
        ? `Florida EMS provider license ${agency.stateLicenseNumber || 'listed'} is on the state provider report.`
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
        ? `${agency.installedFleet.epcrCadSoftware} is recorded in the combined ePCR/CAD field.`
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

    // 3. Research Gaps
    const whatIsNotConfirmed = [
      'Exact biomedical inventory, serial numbers, and battery inventory across frontline units.',
      `Municipal council or district board capital budget voting timeline and FY2026 appropriation gates.`,
      `Medical Direction stance on Real BVM Help® ventilation guidance vs. automated mechanical CPR adoption.`,
      `Local municipal procurement threshold for cooperative contract utilization versus sealed competitive RFP.`
    ];

    // 4. Primary Recommended Move
    let primaryMoveAction = `Review ${isFire ? 'fire department' : 'EMS provider'} operational records`;
    let primaryMoveWhy = 'Review stations, frontline units, annual volume, receiving hospitals, equipment, systems, contracts, and decision makers.';
    let primaryMoveEvidence = 'Source links are provided where available.';
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
    <div ref={profileRootRef} data-laptop-density="compact" data-profile-topic={activeSection} className="agency-command-profile profile-redesign provider-profile-overlay fixed inset-0 md:left-64 z-45 overflow-x-clip overflow-y-auto bg-[#F5F7FA] dark:bg-[#0B1320]">
      <main
        aria-label={`${agency.name} Account 360 Workspace`}
        className="profile-workspace flex min-h-screen w-full min-w-0 flex-col bg-[#F5F7FA] pb-32 font-sans text-[#14283F] dark:bg-[#0B1320] dark:text-slate-100 sm:pb-24 lg:pb-8"
      >
        {/* Top Sticky Account 360 Bar */}
        <header ref={profileHeaderRef} data-testid="profile-sticky-header" className="sticky top-0 z-40 bg-white/95 dark:bg-[#111C2D]/95 backdrop-blur border-b border-[#DFE6EF] dark:border-[#1E2D42] px-3 sm:px-6 lg:px-8 py-1.5 sm:py-0 min-h-14 sm:min-h-16 flex items-center shadow-2xs">
          <div className="mx-auto flex w-full min-w-0 max-w-[1640px] flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {/* Back Navigation & Geographic Breadcrumb */}
            <div className="flex min-w-0 flex-row items-center gap-2 sm:flex-col sm:items-stretch sm:gap-1.5">
              <div className="flex min-w-0 shrink-0 items-center gap-2 sm:shrink sm:gap-2.5">
                <button
                  type="button"
                  onClick={guardedBack}
                  aria-label={backLabel}
                  data-testid="profile-back-button"
                  className="whitespace-nowrap shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#14283F] dark:text-slate-100 bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-[#DFE6EF] dark:border-[#1E2D42] transition-colors cursor-pointer"
                  title={`Return to ${backLabel.replace(/^Back to /, '')}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">Back</span>
                  <span className="hidden sm:inline">{backLabel}</span>
                </button>
                {onGoHome && (
                  <button type="button" onClick={() => { if (confirmLeaveReview()) onGoHome(); }} aria-label="Go to home" data-testid="profile-home-button" className="acp-home-btn">
                    <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}

                <div className="hidden md:flex items-center gap-1.5 text-xs text-[#53657B] dark:text-slate-400 font-medium truncate">
                {onNavigateGeography ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { if (confirmLeaveReview()) onNavigateGeography(agency.stateCode, 'all', 'all'); }}
                      className="text-[#285EE8] dark:text-blue-400 hover:underline cursor-pointer truncate"
                    >
                      {agency.state} ({agency.stateCode})
                    </button>
                    <span aria-hidden="true">›</span>
                    <button
                      type="button"
                      onClick={() => { if (confirmLeaveReview()) onNavigateGeography(agency.stateCode, agency.county, 'all'); }}
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

              <div className="profile-mobile-breadcrumb flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-[#53657B] dark:text-slate-400 md:hidden" aria-label="Selected agency area" data-testid="profile-mobile-breadcrumb">
                {onNavigateGeography ? (
                  <>
                    <button type="button" onClick={() => { if (confirmLeaveReview()) onNavigateGeography(agency.stateCode, 'all', 'all'); }} className="shrink-0 font-semibold text-[#285EE8] dark:text-blue-300">{agency.stateCode}</button>
                    <span aria-hidden="true">›</span>
                    <button type="button" onClick={() => { if (confirmLeaveReview()) onNavigateGeography(agency.stateCode, agency.county, 'all'); }} className="shrink-0 font-semibold text-[#285EE8] dark:text-blue-300">{agency.county}</button>
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

        {/* Region A: compact agency command header. Identity appears once; sections never repeat it. */}
        <section className="acp-header" aria-labelledby="acp-agency-name" data-testid="profile-command-header">
          <div className="acp-header-identity">
            <p className="acp-type">
              <span className="acp-type-ico" data-mode={profileServiceMode}>{profileServiceMode === 'ems' ? <Siren aria-hidden="true" className="h-4 w-4" /> : <Flame aria-hidden="true" className="h-4 w-4" />}</span>
              {profileServiceMode === 'combined' ? 'Fire & EMS' : profileServiceMode === 'fire' ? 'Fire department' : 'EMS provider'}
              {agency.agencyType && <span className="acp-type-sub">· {agency.agencyType}</span>}
            </p>
            <h1 id="acp-agency-name" className="acp-name" data-testid="text-agency-name">{agency.name}</h1>
            <NerisProfileStations key={rawAgency.id+':neris-stations'} agency={rawAgency} directory={directoryAgencies}/>
            <UsfaProfileStations key={rawAgency.id+':usfa-stations'} agency={rawAgency} directory={directoryAgencies}/>
            <TexasProfileLocationEvidence key={rawAgency.id+':texas-location-review'} agency={rawAgency} directory={directoryAgencies}/>
            <NppesPracticeLocationsPanel key={rawAgency.id+':nppes-practice'} agency={rawAgency}/>
            <ProviderAddressLine key={rawAgency.id} agency={rawAgency} directory={directoryAgencies} onReview={()=>{setRequestedReviewField('identity.address');navigateProfileSection('evidence');}} onReviewCandidate={()=>{setRequestedReviewField(ADDRESS_CANDIDATE_FIELD);navigateProfileSection('evidence');}}/>
            {(()=>{const c=providerAddressReview(rawAgency,directoryAgencies);return c&&c.countyVerified&&!c.sharedSourcePoint?<PrivateCoordinateMap key={rawAgency.id+':'+c.sourceIdentityKey+':'+c.snapshotGeneratedAt} agencyId={rawAgency.id} candidate={c}/>:null;})()}
            <div className="acp-contact-row" aria-label="Agency contact actions">
              {agency.headquartersPhone && (
                <a href={`tel:${agency.headquartersPhone}`} data-testid="link-header-call"><Phone aria-hidden="true" className="h-3.5 w-3.5" />Main phone</a>
              )}
              {safeExternalUrl(agency.officialWebsite) && (
                <a href={safeExternalUrl(agency.officialWebsite)} target="_blank" rel="noopener noreferrer" data-testid="link-header-website"><Globe aria-hidden="true" className="h-3.5 w-3.5" />Website</a>
              )}
              <details className="acp-record-context" data-testid="profile-record-context" onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus({ preventScroll: true });
                  event.stopPropagation();
                }
              }}>
                <summary><FileText aria-hidden="true" className="h-3.5 w-3.5" />Record details<ChevronDown aria-hidden="true" className="h-3 w-3" /></summary>
                <div className="acp-record-context-body">
                  {(agency.registryIdentity || agency.fdid || agency.npiNumber || agency.stateLicenseNumber) && (
                    <div className="acp-ids" aria-label="Registry identifiers">
                      {(agency.registryIdentity || agency.fdid) && <span className="acp-id"><b>{agencyIdentifierLabel(agency)}</b></span>}{agency.registryIdentity&&<span className="acp-id">Source listing only · operations unverified</span>}
                      {agency.npiNumber && <span className="acp-id">NPI <b>{agency.npiNumber}</b></span>}
                      {agency.stateLicenseNumber && <span className="acp-id">License <b>{agency.stateLicenseNumber}</b></span>}
                    </div>
                  )}
                  <p className="acp-fresh" data-testid="text-profile-source-period" title="Periods are stated by the source records, not import or review timestamps. Review each source separately when periods differ.">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5" />Source period {latestSourcePeriod ?? 'not stated'}
                  </p>
                </div>
              </details>
            </div>
          </div>
        {/* One clear next step; the remaining tools stay together in a disclosure. */}
        <div
          className="profile-action-dock flex max-w-full items-center gap-2 py-2 no-scrollbar"
          data-testid="profile-primary-actions"
        >
          <button
            type="button"
            onClick={() => {
              navigateProfileSection('deal_story');
            }}
            className="profile-meeting-primary inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors"
            aria-label="Prepare for meeting"
            data-testid="button-profile-prepare-meeting"
            title="Open executive meeting strategy & discovery questions"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Prepare the conversation</span>
          </button>

          <details className="profile-more-actions min-w-0">
            <summary aria-label="Show secondary agency actions">
              <span>More actions</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div
              className="profile-more-actions-menu"
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('button') && !target.closest('.profile-more-sheet-heading')) {
                  const disclosure = event.currentTarget.closest('details');
                  if (disclosure) disclosure.open = false;
                }
              }}
            >
              <div className="profile-more-sheet-heading md:hidden">
                <strong>Account actions</strong>
                <button
                  type="button"
                  aria-label="Close account actions"
                  onClick={(event) => {
                    const disclosure = event.currentTarget.closest('details');
                    if (disclosure) disclosure.open = false;
                    disclosure?.querySelector('summary')?.focus({ preventScroll: true });
                  }}
                ><X aria-hidden="true" className="h-4 w-4" />Close</button>
              </div>
              <div className="profile-stage-control">
                <label htmlFor="profile-sales-stage">Pipeline stage</label>
                <select
                  id="profile-sales-stage"
                  aria-label="Update CRM Sales Pipeline Stage"
                  data-testid="profile-sales-stage"
                  value={agency.zollOpportunity.salesStage}
                  onChange={(e) => onUpdateStage(agency.id, e.target.value as LeadStage)}
                >
                  {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
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
                  className="profile-secondary-action"
                  data-testid="button-open-comparison-from-profile"
                >
                  Compare {comparedAgencyIds.length}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSourceDrawerOpen(true)}
                aria-label="Inspect agency sources"
                data-testid="button-profile-inspect-sources"
                title="Inspect mapped agency source records"
                className="profile-secondary-action"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                Sources
              </button>
              <button
                type="button"
                onClick={() => onToggleRoute(agency.id)}
                aria-label={agency.inDayRoute ? "Remove agency from today's route" : 'Add agency to route'}
                data-testid="button-profile-toggle-route"
                title={agency.inDayRoute ? "Remove from today's route" : 'Add to route'}
                className={`profile-secondary-action ${agency.inDayRoute ? 'is-selected' : ''}`}
              >
                <Navigation className="h-4 w-4" />
                {agency.inDayRoute ? 'On route' : 'Add route'}
              </button>
              <button
                type="button"
                onClick={() => onToggleBookmark(agency.id)}
                aria-label={agency.isBookmarked ? 'Remove agency from saved work' : 'Save agency to My Work'}
                data-testid="button-profile-toggle-save"
                title="Save account to My Work"
                className={`profile-secondary-action ${agency.isBookmarked ? 'is-selected' : ''}`}
              >
                <Bookmark className="h-4 w-4" />
                {agency.isBookmarked ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowDossierModal(true)}
                data-testid="button-profile-print-brief"
                title="Print agency brief"
                className="profile-secondary-action"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
              {onOpenRfpGenerator && (
                <button
                  type="button"
                  onClick={() => onOpenRfpGenerator(agency)}
                  data-testid="button-profile-generate-rfp"
                  title="Generate RFP specification"
                  className="profile-secondary-action"
                >
                  <FileText className="h-4 w-4" />
                  RFP spec
                </button>
              )}
            </div>
          </details>
        </div>
        </section>

          <ProfileContactDisclosure>
            <AgencyIdentityStrip agency={agency} onPeople={()=>navigateProfileSection('decision_makers')}/>
          </ProfileContactDisclosure>

        {/* Main Account 360 Workspace Content */}
        <div className="profile-brief-layout mx-auto w-full min-w-0 max-w-[1640px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {/* ================================================================
              ABOVE THE FOLD — 3 PRIMARY DECISION BLOCKS (SECTION 9)
             ================================================================ */}
          {/* Registry identifiers, planning estimates, assessment and review controls are portaled
              into the Financial / Evidence detail host below; this container renders nothing in place. */}
          <div hidden aria-hidden="true" className="profile-portal-sources">
            {/* BLOCK 1: AGENCY IDENTITY AND OFFICIAL IDENTIFIERS */}
            <div className="flex flex-col gap-4 pb-6 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
              <div className="space-y-3 min-w-0">

              </div>

              {profileDetailsHost && createPortal(
              <details className="rounded-lg border border-[#DFE6EF] bg-[#F8FAFC] p-3 dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <summary className="min-h-9 cursor-pointer list-none font-semibold text-sm text-[#30465C] dark:text-slate-200">Registry identifiers</summary>
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
                  {hasUserLinkedNppesRecord ? (
                    <button
                      type="button"
                      onClick={() => setIsSourceDrawerOpen(true)}
                      className="inline-flex min-h-8 items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <UserCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>NPPES record linked by user</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSourceDrawerOpen(true)}
                      className="inline-flex min-h-8 items-center gap-1 font-medium text-[#53657B] hover:underline dark:text-slate-300"
                    >
                      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>No NPPES record linked by user</span>
                    </button>
                  )}
                </div>
              </details>,
              profileDetailsHost,
              )}
              {profileDetailsHost && createPortal(
                <div className="profile-review-strip flex flex-wrap items-center gap-2 border-t border-[#DFE6EF] pt-3 dark:border-[#1E2D42]">
                  <button
                    type="button"
                    onClick={markProfileReviewed}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#B8C9C0] bg-white px-3 text-xs font-semibold text-[#176568] transition-colors hover:bg-[#E7F1EE] dark:border-[#40585A] dark:bg-[#172528] dark:text-[#9BD0C6] dark:hover:bg-[#203735]"
                    data-testid={`button-mark-profile-reviewed-${agency.id}`}
                  >
                    Save review marker
                  </button>
                  {profileReviewError && (
                    <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300" role="alert">
                      {profileReviewError}
                    </p>
                  )}
                </div>,
                profileDetailsHost,
              )}

              {/* Less-frequent commercial planning details remain available but collapsed by default. */}
              {profileDetailsHost && createPortal(
              <details className="rounded-lg border border-[#DFE6EF] bg-[#F8FAFC] p-3 dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <summary className="min-h-9 cursor-pointer list-none font-semibold text-sm text-[#30465C] dark:text-slate-200">Planning scores and estimates</summary>
                <div className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-medium text-[#53657B] dark:text-slate-400">
                    <PulseIqEstimateLabel /> · <TermTooltip termKey="pulseiq" label="PulseIQ priority" /> · Modeled · {String(agency.zollOpportunity.priorityTier) === 'Not calculated' ? MISSING_INPUT_COPY.priority : agency.zollOpportunity.priorityTier}
                  </span>
                  <span className="font-semibold text-lg text-[#14283F] dark:text-white tabular-nums">
                    {Number.isFinite(agency.zollOpportunity.pulseIqScore)
                      ? <>{agency.zollOpportunity.pulseIqScore}<span className="text-xs font-normal text-[#53657B]">/100</span></>
                      : <span className="text-sm font-medium">{MISSING_INPUT_COPY.pulseIqScore}</span>}
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
                      {hasDecisionGradeInputs ? formatCurrency(actuarialForecast.netCapExBase) : <span className="block text-xs font-medium text-[#53657B] dark:text-slate-400" data-testid="text-capex-missing-reason">{MISSING_INPUT_COPY.fleetPricing}; see evidence below</span>}
                    </div>
                  </div>
                  <div className="bg-[#F5F7FA] dark:bg-[#16243A] p-2.5 text-right">
                    <div className="text-xs text-[#53657B] dark:text-slate-400">
                      5-Yr TCO savings
                    </div>
                    <div className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {hasDecisionGradeInputs ? formatCurrency(actuarialForecast.fiveYrTcoBase, { showSign: true }) : <span className="block text-xs font-medium text-[#53657B] dark:text-slate-400" data-testid="text-tco-missing-reason">{MISSING_INPUT_COPY.tcoSavings}</span>}
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
                    <div className="text-xs text-amber-700 dark:text-amber-400">No opportunity record is attached.</div>
                  )}
                </div>
                </div>
              </details>,
              profileDetailsHost,
              )}
            </div>

            {/* ================================================================
                BLOCK 2: ACCOUNT ASSESSMENT (4 EVIDENCE-GROUNDED PILLARS)
               ================================================================ */}
            {profileDetailsHost && createPortal(
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

                <button type="button" onClick={() => navigateProfileSection('medicare')} className="text-xs font-semibold text-[#285EE8] hover:underline">Edit assumptions in Financial</button>
              </div>

              {/* 4 Assessment Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                          navigateProfileSection('deal_story');
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
                PLANNING CONTEXT — discussion topics
               ================================================================ */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-[#53657B] dark:text-slate-400">
                <DataLabel kind="score">Planning context</DataLabel>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Discovery prompts are planning context, not verified agency facts. */}
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

                {/* Relevant timing */}
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

                {/* Potential product relevance */}
                <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-1.5">
                  <div className="text-xs font-semibold text-[#14283F] dark:text-slate-200">
                    Potential product fit
                  </div>
                  <div className="text-sm font-semibold text-[#14283F] dark:text-white">
                    {agency.zollOpportunity.primaryTargetProduct || 'Not reported'}
                  </div>
                  <p className="text-xs text-[#53657B] dark:text-slate-300">
                    {agency.zollOpportunity.primaryTargetProduct
                      ? 'Potential product discussion based on the recorded profile.'
                      : 'Product fit not reported in this record.'}
                  </p>
                </div>
              </div>
            </div>

              </div>
            </details>,
            profileDetailsHost,
            )}
          </div>

          {/* ================================================================
              ACCOUNT 360 TOPIC NAVIGATION
             ================================================================ */}

          <nav
            data-testid="profile-topic-navigation"
            aria-label="Account 360 Topic Navigation"
            className="acp-nav sticky top-[var(--acp-sticky-header-h,108px)] z-30 md:top-[var(--acp-sticky-header-h,4rem)]"
          >
            <div className="w-full md:hidden">
              <label htmlFor="profile-section-select" className="acp-mobile-section-label">Explore</label>
              <select
                id="profile-section-select"
                value={activeSection}
                aria-controls="profile-topic-panel"
                onChange={(event) => navigateProfileSection(event.target.value as ProfileSection)}
                className="acp-nav-select"
                data-testid="select-profile-section-mobile"
              >
                {[...PRIMARY_PROFILE_IDS.map(id=>PROFILE_SECTIONS.find(tab=>tab.id===id)!),...PROFILE_SECTIONS.filter(tab=>!PRIMARY_PROFILE_IDS.includes(tab.id))].map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
              </select>
            </div>
            <div className="acp-nav-tabs overflow-x-auto" role="tablist" aria-label="Profile sections" onKeyDown={(event) => {
              if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
              if (navigateProfileSection(buttons[next].dataset.section as ProfileSection)) buttons[next].focus({ preventScroll: true });
            }}>
              {PRIMARY_PROFILE_IDS.map(id=>PROFILE_SECTIONS.find(tab=>tab.id===id)!).map((tab) => {
                const isActive = activeSection === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    data-section={tab.id}
                    id={`profile-tab-${tab.id}`}
                    aria-controls="profile-topic-panel"
                    aria-selected={isActive}
                    tabIndex={isActive || (!PRIMARY_PROFILE_IDS.includes(activeSection) && tab.id==='overview') ? 0 : -1}
                    data-testid={`tab-profile-${tab.id}`}
                    onClick={() => navigateProfileSection(tab.id)}
                    className={`acp-tab${isActive ? ' is-active' : ''}`}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {tab.short}
                    {tab.id === 'activity' && agency.fieldNotes.length > 0 && <span className="acp-tab-count">{agency.fieldNotes.length}</span>}
                  </button>
                );
              })}
            </div>
            <label className="hidden md:block acp-more-label">More account details<select value={PRIMARY_PROFILE_IDS.includes(activeSection)?'':activeSection} onChange={event=>event.target.value&&navigateProfileSection(event.target.value as ProfileSection)} aria-label="Additional account detail"><option value="">Choose a topic</option>{PROFILE_SECTIONS.filter(tab=>!PRIMARY_PROFILE_IDS.includes(tab.id)).map(tab=><option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></label>
          </nav>

          <div
            key={activeSection}
            ref={profileTopicRef}
            id="profile-topic-panel"
            className="acp-topic-content"
            role="tabpanel"
            aria-label={PROFILE_SECTIONS.find(tab=>tab.id===activeSection)?.label}
            tabIndex={0}
          >
          {activeSection === 'overview' && (
            <div className="pi-surface p-3 text-sm" data-testid="provider-validation-notice"><strong>End-user validation required</strong><p>Registry and imported records are working source information, not confirmed operating facts. Verify individual addresses, equipment, contacts, dates and volumes with the agency. Missing values are not reported.</p><button type="button" className="workspace-button min-h-11" onClick={openProfileSources}>Review individual facts and sources</button></div>
          )}
          {activeSection === 'overview' && (
            <ProfileCommandOverview agency={agency} onReviewFact={fieldId=>{setRequestedReviewField(fieldId);navigateProfileSection('evidence');}} onNavigate={navigateProfileSection} onOpenSources={openProfileSources}>
              <ProfileAttentionSummary key={agency.id} agency={agency} onNavigate={navigateProfileSection} />
            </ProfileCommandOverview>
          )}

          {activeSection === 'overview' && <ProviderIntelligenceCoverage key={rawAgency.id} agency={rawAgency} directory={directoryAgencies} onReview={openProfileSources}/>}
          {activeSection === 'overview' && <DepartmentFacilities key={rawAgency.id} agency={rawAgency} onReview={openProfileSources}/>}

          {activeSection !== 'overview' && (
            <header className="acp-section-intro" data-section={activeSection} data-testid="profile-section-intro">
              {(() => {
                const topic = PROFILE_SECTIONS.find((tab) => tab.id === activeSection);
                const TopicIcon = topic?.icon;
                return (
                  <>
                    {TopicIcon && <TopicIcon aria-hidden="true" className="acp-intro-ico" />}
                    <div className="acp-intro-text">
                      <h2>{topic?.label}</h2>
                      <p>{topic?.purpose}</p>
                    </div>
                  </>
                );
              })()}
            </header>
          )}

          {activeSection === 'equipment' && <ProviderCompetitiveProfile agency={rawAgency} directory={directoryAgencies} view="equipment" onOpenSources={openProfileSources}/>}
          {activeSection === 'equipment' && (
            <AgencyIntelligenceBrief view="equipment" agency={agency} renderFactTag={(field) => <FactVerificationTag agency={agency} field={field} />} onOpenSources={openProfileSources} />
          )}
          {activeSection === 'meeting' && (
            <AgencyIntelligenceBrief view="overview" agency={agency} renderFactTag={(field) => <FactVerificationTag agency={agency} field={field} />} onOpenSources={openProfileSources} />
          )}
          {activeSection === 'deal_story' && (
            <div className="profile-deal-workspace" data-testid="profile-deal-story">
              <PreCallPlanner key={rawAgency.id} agency={rawAgency} directory={directoryAgencies} onOpenSources={openProfileSources}/>
              <ReviewedPreCallPlanner key={'reviewed:'+rawAgency.id} agency={rawAgency} directory={directoryAgencies} onOpenSources={openProfileSources} onCreateTask={onCreateFollowUp}/>
              <DealDiscoveryWorkspace agency={agency} onCreateTask={onCreateFollowUp}/>
              <DealStoryBriefingView key={agency.id} agency={agency} variant="full" onOpenDossier={() => setShowDossierModal(true)} />
            </div>
          )}
          {activeSection === 'purchasing' && <ProviderCompetitiveProfile agency={rawAgency} directory={directoryAgencies} view="purchasing" onOpenSources={openProfileSources}/>}
          {activeSection === 'purchasing' && (
            <AgencyIntelligenceBrief view="purchasing" agency={agency} renderFactTag={(field) => <FactVerificationTag agency={agency} field={field} />} onOpenSources={openProfileSources} />
          )}
          {activeSection === 'operations' && (
            <AgencyIntelligenceBrief view="operations" agency={agency} renderFactTag={(field) => <FactVerificationTag agency={agency} field={field} />} onOpenSources={openProfileSources} />
          )}

          {/* TOPIC 4: DECISION MAKERS & AUTHORIZED COMMAND ROSTER */}
          {showSection('leadership') && <><DecisionMakerDirectory agency={agency} /><AgencyAuthorityEvidence key={rawAgency.id} agencyId={rawAgency.id}/></>}

          {showSection('battlecard') && (<ProfileDetail testId="detail-battlecard" icon={Scale} tone="navy" kind="reference" title="Head-to-head comparison" summary={`Recorded incumbent ${agency.installedFleet.defibBrand} vs. benchmark alternative · manufacturer claims, not agency outcomes`}>
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
          </ProfileDetail>)}

                  {showSection('apparatus') && (<ProfileDetail testId="detail-apparatus" icon={Truck} tone="teal" kind="reported" title="Apparatus & receiving hospitals" summary="Vehicle breakdown, trauma and STEMI transport logistics">
          {/* Granular Apparatus Vehicle Fleet, Hospital Transport Logistics & Multi-Year FEMA Grant History */}
          {showSection('apparatus') &&
          !(
            hasAgencyFactEvidence(agency, 'apparatusBreakdown') &&
            hasAgencyFactEvidence(agency, 'receivingHospitalStemi')
          ) ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Detailed fleet and receiving-hospital values are not listed in this account record.
            </div>
          ) : showSection('apparatus') && agency.apparatusFleet && agency.hospitalLogistics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Granular Apparatus Vehicle Breakdown */}
              <section className="acp-card space-y-4">
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
              <section className="acp-card space-y-4">
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
          </ProfileDetail>)}

                {showSection('clinical') && (<ProfileDetail testId="detail-clinical" icon={HeartPulse} tone="red" kind="reported" title="Clinical performance & quality measures" summary="Survival funnel, quality measures and protocol alignment. Modeled uplift is labeled and never an achieved outcome.">
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
            {/* Reported measures only. The legacy survival funnel and quality simulator substituted
                default values and projected survivors, so they are not shown on agency profiles. */}
            <ClinicalMeasures agency={agency} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Card A: Clinical Emergency Performance & Patient Outcomes */}
              <section className="acp-card space-y-4">
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
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="calls">Annual emergency calls</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annualCallVolume)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Total 911 dispatches</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="transports">Annual 911 transports</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annual911Transports)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Billable patient runs</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="cardiac">Cardiac arrest (OHCA) calls</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.annualCardiacArrestCalls)} / yr</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Resuscitation activations</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400 font-medium"><DataLabel kind="cardiac">Utstein cardiac survival</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{reportMetric(agency.utsteinSurvivalRate, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Survival to discharge</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400 font-medium">CARES good neuro (CPC 1/2)</dt>
                    <dd className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{reportMetric(agency.qualityMetrics.caresGoodNeurologicalSurvivalPct, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Intact neurological outcome</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="clinical">Bystander CPR rate</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.bystanderCPRRate, '%')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Prior to EMS arrival</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="incidents">Annual trauma incidents</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.gisData.annualTraumaIncidents)}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">{agency.gisData.traumaCenterLevel || 'Trauma center level not reported'}</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="transportTime">Avg EMS transport time</DataLabel></dt>
                    <dd className="text-base font-semibold tabular-nums text-[#0F172A] dark:text-white mt-0.5">{reportMetric(agency.gisData.avgTransportTimeMinutes, ' mins')}</dd>
                    <dd className="text-[10px] text-slate-500 dark:text-slate-400">Scene to ED arrival</dd>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#16243A] border border-slate-200 dark:border-[#1E2D42]">
                    <dt className="text-[#53657B] dark:text-slate-400"><DataLabel kind="distance">STEMI PCI Cath Lab dist.</DataLabel></dt>
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
              <section className="acp-card space-y-4">
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
            <section className="acp-card space-y-4">
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

              <ScrollableTableRegion label="Regional clinical protocol table" className="border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4"><DataLabel kind="clinical">Regional Clinical Protocol Mandate</DataLabel></th>
                      <th className="py-3 px-4"><DataLabel kind="clinical">Clinical Target Benchmark</DataLabel></th>
                      <th className="py-3 px-4"><DataLabel kind="equipment">Incumbent Fleet Limitation</DataLabel></th>
                      <th className="py-3 px-4"><DataLabel kind="clinical">ZOLL Enabling Clinical Technology</DataLabel></th>
                      <th className="py-3 px-4 text-right"><DataLabel kind="review">Status</DataLabel></th>
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
              </ScrollableTableRegion>
            </section>
          </div>
        )}
        </ProfileDetail>)}

                {activeSection === 'medicare' && <CmsAmbulanceEvidencePanel key={rawAgency.id+':'+(rawAgency.npiNumber??'')+':'+(rawAgency.registryIdentity?.identifier??'')} agency={rawAgency}/>}
                {activeSection === 'medicare' && (
          <FinancialIntelligence
            agency={agency}
            mode={profileServiceMode}
            tcoModel={tcoModel}
            benchmarkMatched={Boolean(matchedBenchmarkId)}
            selectedBenchmarkId={effectiveBenchmarkId}
            onSelectBenchmark={setSelectedBenchmarkId}
            includedUnits={comparisonUnits}
            onIncludedUnits={setIncludedUnits}
            unitMsrp={customUnitMsrp}
            tradeInPerUnit={customTradeInCredit}
            capturePct={customDenialCapturePct}
            onUnitMsrp={setCustomUnitMsrp}
            onTradeIn={setCustomTradeInCredit}
            onCapturePct={setCustomDenialCapturePct}
            recoveryPool={actuarialForecast.hasRecoveryInputs ? (agency.cmsData.medicareDeniedAmountAnnual ?? null) : null}
          />
        )}

        {showSection('billing') && (<ProfileDetail testId="detail-hcpcs" icon={FileText} tone="blue" kind="reported" title="HCPCS procedure breakdown & GADCS status" summary="Procedure-level claim records where a CMS source is attached">
        {/* SECTION: INSURANCE OUTCOMES (MEDICARE, MEDICAID, COMMERCIAL, SELF-PAY) & DENIALS / RECOVERABLE */}
        {showSection('billing') && !hasAgencyFactEvidence(agency, 'cmsClaims') ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            CMS claim and revenue fields are not listed in this account record. Available financial fields remain listed in the operational baseline above.
          </div>
        ) : showSection('billing') && (
          <section className="acp-card space-y-6">
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

            {/* Granular HCPCS Procedure Breakdown & CMS GADCS 10% Penalty Risk Table */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    <DataLabel kind="claims">Procedure-Level HCPCS Ambulance Fee Schedule &amp; CMS GADCS 10% Penalty Exposure</DataLabel>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {hcpcsModel ? <>{hcpcsModel.gadcs.cohortWave} · Readiness: <strong className="text-[#0F172A]">{hcpcsModel.gadcs.reportingReadinessStatus}</strong> · {hcpcsModel.gadcs.keyComplianceGap}</> : <span data-testid="text-gadcs-missing-reason">Cohort, readiness and penalty exposure: {MISSING_INPUT_COPY.medicareInputs.toLowerCase()}.</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Modeled estimate inputs: {hcpcsModel
                      ? `${hcpcsModel.inputs.annualTransports.toLocaleString()} reported transports and ${hcpcsModel.inputs.medicarePayerPct}% Medicare payer share. Method: ${hcpcsModel.inputs.method}`
                      : 'awaiting the reported inputs above.'}
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg">
                  GADCS 10% Medicare Penalty Risk: {hcpcsModel ? `-$${hcpcsModel.gadcs.gadcs10PctPenaltyExposure.toLocaleString()}/yr` : 'Pending inputs'}
                </span>
              </div>

              <ScrollableTableRegion label="HCPCS ambulance fee schedule table" className="border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4"><DataLabel kind="identifier">HCPCS Code</DataLabel></th>
                      <th className="py-2.5 px-4"><DataLabel kind="clinical">Procedure &amp; Clinical Requirement</DataLabel></th>
                      <th className="py-2.5 px-4 text-right">CMS Base Rate</th>
                      <th className="py-2.5 px-4 text-right"><DataLabel kind="claims">Annual Claims</DataLabel></th>
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
                          {proc.annualRevenueAtRisk == null ? <span className="font-sans text-xs font-medium text-slate-500">{MISSING_INPUT_COPY.procedureDenial}</span> : `-$${proc.annualRevenueAtRisk.toLocaleString()}`}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-md">{proc.zollDocumentationMitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTableRegion>
            </div>
          </section>
        )}
        </ProfileDetail>)}

                {showSection('suppliers') && <><ProcurementTimeline agency={agency} /><ReviewedLifecycleTimeline agency={rawAgency} directory={directoryAgencies}/></>}
        {showSection('suppliers') && (<ProfileDetail testId="detail-suppliers" icon={PackageCheck} tone="teal" kind="reported" title="Supplier, contract & procurement audit records" summary="Supplier records, procurement document IDs and incumbent-versus-alternative matrix. Brand is not supplier.">
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
                  <div className="font-semibold">Recorded monitor details</div>
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
          <section className="acp-card space-y-6">
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
                <DataLabel kind="contract">01. Direct Vendor &amp; Distributor Supplier Cards</DataLabel>
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
                    <span className="text-[11px] font-bold text-[#1E3A8A]">ePCR / CAD (combined record)</span>
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
                <DataLabel kind="equipment">02. Complete Equipment &amp; Supplier Procurement Table</DataLabel>
              </h3>
              <ScrollableTableRegion label="Equipment and supplier procurement table" className="border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4"><DataLabel kind="equipment">Equipment / System Category</DataLabel></th>
                      <th className="py-3 px-4"><DataLabel kind="service">Actual Model / Software in Use</DataLabel></th>
                      <th className="py-3 px-4">Active Units</th>
                      <th className="py-3 px-4"><DataLabel kind="warranty">Age &amp; Warranty Status</DataLabel></th>
                      <th className="py-3 px-4">Current Supplier / Distributor</th>
                      <th className="py-3 px-4"><DataLabel kind="expiration">Maintenance Contract &amp; Renewal</DataLabel></th>
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
              </ScrollableTableRegion>
            </div>

            {/* MODALITY 3: SIDE-BY-SIDE CURRENT VENDOR VS. ZOLL COMPARISON MATRIX */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-[#1E3A8A]" />
                <span>03. Side-by-Side Current Supplier vs. Integrated ZOLL Replacement Matrix</span>
              </h3>
              <ScrollableTableRegion label="Current supplier versus replacement matrix" className="border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F172A] text-white font-semibold">
                      <th className="py-3 px-4">Operational Domain</th>
                      <th className="py-3 px-4">Current Equipment &amp; Supplier at {agency.name}</th>
                      <th className="py-3 px-4">Recommended ZOLL Integrated Solution</th>
                      <th className="py-3 px-4"><DataLabel kind="clinical">Clinical &amp; Financial Impact for Provider</DataLabel></th>
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
              </ScrollableTableRegion>
            </div>

          </section>
        )}
        </ProfileDetail>)}

                {showSection('fleet') && (<ProfileDetail testId="detail-device-fleet" icon={Layers} tone="blue" kind="reported" title="Device-level fleet & maintenance contract records" summary="Unit counts, warranty documents and frontline apparatus maintenance detail">
        {/* SECTION: ACTIVE DEFIBRILLATOR & BIOMEDICAL FLEET + FRONTLINE APPARATUS & MAINTENANCE CONTRACTS */}
        {showSection('fleet') &&
          hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
          hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
          hasAgencyFactEvidence(agency, 'frontlineApparatusStations') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="acp-card space-y-4">
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

            <section className="acp-card space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Frontline Apparatus &amp; Maintenance Contracts</span>
              </h2>

              <dl className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="ambulances">Ambulance Fleet</DataLabel></dt>
                  <dd className="text-base font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.totalAmbulances)} Frontline Units</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="apparatus">Fire Apparatus</DataLabel></dt>
                  <dd className="text-base font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.totalFireEngines)} Engines / Ladders</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="contract">Current Maintenance Vendor</DataLabel></dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.competitorContract.vendor}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="expiration">Contract Expiration Date</DataLabel></dt>
                  <dd className="font-semibold pi-data-inline text-slate-900 dark:text-white mt-0.5">{agency.competitorContract.contractEndDate}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="cost">Annual Service Cost / Unit</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatCurrency(agency.competitorContract.annualServiceCostPerUnit, { perYear: true, compact: false })}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="expiration">Renewal Notice Window</DataLabel></dt>
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
        </ProfileDetail>)}

                {activeSection === 'equipment' && benchmarkIntel && (
          <ProfileDetail testId="detail-recall-reference" icon={ShieldAlert} tone="red" kind="reference" title={`Benchmark reference: ${benchmarkIntel.incumbentModel}`} summary="Model-level regulatory and lifecycle notes. Confirm that the agency's units are affected before raising it.">
            <dl className="acp-kv">
              <div><dt>Lifecycle status</dt><dd>{benchmarkIntel.eolStatus}</dd></div>
              <div><dt>Lifecycle note</dt><dd>{benchmarkIntel.eolTimelineNote}</dd></div>
              <div><dt>Regulatory record</dt><dd>{benchmarkIntel.fdaRecallId} · {benchmarkIntel.fdaRecallClass}</dd></div>
              <div><dt>Summary</dt><dd>{benchmarkIntel.fdaRecallSummary}</dd></div>
            </dl>
            <p className="acp-kv-note">Applies to the model family recorded as {agency.installedFleet.defibBrand}; serial-level applicability is not known. Library reference, not an agency source.</p>
          </ProfileDetail>
        )}
        {showSection('software') && (<ProfileDetail testId="detail-software" icon={Cpu} tone="navy" kind="reported" title="Dispatch, ePCR & billing systems" summary={[agency.installedFleet.dispatchCadVendor, agency.installedFleet.epcrCadSoftware, agency.installedFleet.billingSoftware].filter((v) => v && v !== 'Not reported').join(' · ') || 'No systems recorded'}>
        {/* SECTION: CAD, ePCR & BILLING SOFTWARE */}
        {showSection('software') && (
          <section className="acp-card space-y-4">
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
                <div className="font-semibold text-[#1E3A8A] dark:text-blue-400 font-mono text-[10px] uppercase tracking-wider">ePCR / CAD (combined record)</div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {agency.installedFleet.epcrCadSoftware || 'Not reported'}
                </div>
                {hasAgencyFactEvidence(agency, 'epcrSystem') && (
                  <div className="text-slate-600 dark:text-slate-400">Supplier: <strong className="text-slate-900 dark:text-white">Saffire Software, Inc.</strong></div>
                )}
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {hasAgencyFactEvidence(agency, 'epcrSystem')
                    ? 'A source is mapped to this software record.'
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
        </ProfileDetail>)}

                {showSection('grants') && (<ProfileDetail testId="detail-grants" icon={Award} tone="teal" kind="reported" title="Grants, cooperative contracts & jurisdiction" summary={`${(agency.femaGrantHistory ?? []).length} grant record(s) · cooperative purchasing vehicles · service demographics`}>
        {/* SECTION: FEDERAL FEMA GRANT READINESS & FUNDING STATUS + JURISDICTION & SERVICE DEMOGRAPHICS */}
        {showSection('grants') && !hasAgencyFactEvidence(agency, 'federalGrant') ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Grant award and SAFER details are not listed in this account record.
          </div>
        ) : showSection('grants') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Federal FEMA Grant Readiness & Funding Status */}
            <section className="acp-card space-y-4">
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
            <section className="acp-card space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
                <span>Jurisdiction &amp; Service Demographics</span>
              </h2>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="service">Service Model</DataLabel></dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.agencyType}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium">Government Level</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{agency.jurisdictionLevel} Jurisdiction</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="population">Population Served</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{reportMetric(agency.populationServed)}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="stations">Stations &amp; Facilities</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatInteger(agency.stationsCount)} Active Stations</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="personnel">Certified Personnel</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatInteger(agency.totalEMSStaff)} Responders</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="coverage">Coverage Territory</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{agency.responseAreaSqMiles} Sq. Miles</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="population">Senior Population (65+)</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatPercent(agency.gisData.seniorPopulationPct)} of Residents</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="income">Median Household Income</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatCurrency(agency.gisData.medianHouseholdIncome, { compact: false })}</dd>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs font-medium"><DataLabel kind="poverty">Community Poverty Rate</DataLabel></dt>
                  <dd className="font-semibold pi-metric-card text-slate-900 dark:text-white mt-0.5">{formatPercent(agency.gisData.povertyRate)}</dd>
                </div>
              </dl>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  <DataLabel kind="location">Geography links and relationship basis</DataLabel>
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
            <section className="lg:col-span-2 acp-card space-y-4">
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

              <ScrollableTableRegion label="Cooperative purchasing contracts table" className="border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4"><DataLabel kind="contract">Contract Vehicle &amp; Master ID</DataLabel></th>
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
              </ScrollableTableRegion>
            </section>

            {/* 5-Year Federal FEMA AFG, SAFER & Homeland Security Grant History */}
            {agency.femaGrantHistory && agency.femaGrantHistory.length > 0 && (
              <section className="lg:col-span-2 acp-card space-y-4">
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

                <ScrollableTableRegion label="Federal grant history table" className="border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-4"><DataLabel kind="period">Fiscal Year</DataLabel></th>
                        <th className="py-2.5 px-4"><DataLabel kind="funding">Federal Grant Program</DataLabel></th>
                        <th className="py-2.5 px-4"><DataLabel kind="equipment">Approved Equipment &amp; Operational Scope</DataLabel></th>
                        <th className="py-2.5 px-4 text-right"><DataLabel kind="funding">Federal Award</DataLabel></th>
                        <th className="py-2.5 px-4 text-right">Local Match</th>
                        <th className="py-2.5 px-4 text-right"><DataLabel kind="funding">Status</DataLabel></th>
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
                </ScrollableTableRegion>
              </section>
            )}

          </div>
        )}
        </ProfileDetail>)}

                {activeSection === 'evidence' && (
          <section className="acp-fact-review" aria-label="Fact review" data-testid="section-fact-review">
            <FactReviewPanel key={agency.id+':'+(requestedReviewField??'default')} agency={agency} requestedFieldId={requestedReviewField} addressCandidate={providerAddressReview(rawAgency,directoryAgencies)} />
          </section>
        )}

        {/* SECTION: FIELD NOTES */}
        {showSection('notes') && <><FollowUpWorkspace compact agencies={[agency]} onUpdate={onUpdateFollowUp} onCreate={onCreateFollowUp} /><FieldNotesPanel key={agency.id} agency={agency} onAdd={onAddFieldNote} /></>}

        {/* TOPIC 7: EVIDENCE & SOURCES PROVENANCE LEDGER */}
        {showSection('evidence_ledger') && (
          <section id="profile-source-evidence" className="pi-surface scroll-mt-28 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-4">
              <div>
                  <h2 className="pi-section-heading">
                    <DataLabel kind="source">Source Evidence &amp; Data Mapping</DataLabel>
                  </h2>
                <p className="pi-supporting mt-0.5">
                    This page maps available values and source records to {agency.name}. API results are candidates only; the end user decides whether a record belongs to this agency and whether its information is accurate. Search results never overwrite profile fields.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerLiveVerification}
                  disabled={isVerifyingLive}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white cursor-pointer disabled:opacity-50"
                >
                    {isVerifyingLive ? 'Searching NPPES…' : 'Search CMS NPPES'}
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

            {liveNppesError && (
              <p
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                role="status"
                data-testid="nppes-search-error"
              >
                {liveNppesError}
              </p>
            )}
            {liveNppesResult && (
              <section
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/60"
                aria-labelledby={`nppes-search-results-${agency.id}`}
                data-testid="nppes-search-results"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3
                      id={`nppes-search-results-${agency.id}`}
                      className="text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      CMS NPPES search results
                    </h3>
                    <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                      Candidate records only. The API did not verify this provider or its operations. Linking a record is your association decision and does not change profile values.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {liveNppesResult.candidateCount} candidate{liveNppesResult.candidateCount === 1 ? '' : 's'} · searched {new Date(liveNppesResult.fetchedAt).toLocaleString()}
                  </span>
                </div>
                {liveNppesResult.details && (
                  <p className="mt-2 text-[10px] text-slate-600 dark:text-slate-400">
                    {liveNppesResult.details}
                  </p>
                )}
                {liveNppesResult.candidates.length === 0 ? (
                  <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                    No candidate records were returned. No profile values were changed.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                    {liveNppesResult.candidates.map((candidate) => {
                      const association = agency.sourceRecordAssociations?.find(
                        (record) =>
                          record.sourceName.toLowerCase().includes('nppes') &&
                          record.sourceRecordId === candidate.npiNumber,
                      );
                      return (
                        <li
                          key={candidate.npiNumber}
                          className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          data-testid={`nppes-candidate-${candidate.npiNumber}`}
                        >
                          <div className="min-w-0">
                            <a
                              href={candidate.registryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
                            >
                              {candidate.officialName || 'Name not stated'}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <p className="mt-0.5 break-words text-[10px] text-slate-600 dark:text-slate-400">
                              NPI {candidate.npiNumber}
                              {[candidate.address, candidate.city, candidate.stateCode, candidate.zipCode, candidate.taxonomyDescription]
                                .filter(Boolean)
                                .map((value) => ` · ${value}`)
                                .join('')}
                            </p>
                            <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-500">
                              {association?.decision === 'confirmed'
                                ? 'User linked this source record to the agency'
                                : association?.decision === 'rejected'
                                  ? 'User marked this source record as a different agency'
                                  : 'Not yet associated with this agency'}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => decideNppesCandidate(candidate, 'confirmed')}
                              className="min-h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              data-testid={`button-link-nppes-${candidate.npiNumber}`}
                            >
                              Link to agency
                            </button>
                            <button
                              type="button"
                              onClick={() => decideNppesCandidate(candidate, 'rejected')}
                              className="min-h-8 rounded-md border border-slate-200 px-2.5 text-[10px] font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                              data-testid={`button-reject-nppes-${candidate.npiNumber}`}
                            >
                              Not this agency
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            <div className="scannable-table-wrap">
              <table className="scannable-table">
                <thead>
                  <tr>
                    <th>Domain / Metric</th>
                    <th>Recorded Value</th>
                    <th>Record status</th>
                    <th><DataLabel kind="source">Primary Registry / Citation</DataLabel></th>
                    <th><DataLabel kind="source">Open source</DataLabel></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold text-[#14283F] dark:text-white">Provider Identity &amp; NPI</td>
                    <td className="pi-metric-id">{hasUserLinkedNppesRecord ? `NPI ${linkedNppesAssociation?.sourceRecordId} · user-linked source record` : agency.npiNumber ? `Profile lists NPI ${agency.npiNumber}; no source record linked by user` : 'No NPPES source record linked by user'}</td>
                    <td>
                      <span className="profile-evidence-tag px-2 py-0.5 text-[11px] font-semibold">
                        {hasUserLinkedNppesRecord ? 'User associated with agency' : 'Source candidate'}
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
                          ? 'Review marker recorded'
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
                          ? 'Review marker recorded'
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
                          ? 'Review marker recorded'
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
                        onClick={() => navigateProfileSection('medicare')}
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

        {activeSection === 'evidence' && (
          <details className="acp-disclosure" data-testid="details-complete-agency-record">
            <summary>Complete agency record &amp; source associations<ChevronDown aria-hidden="true" className="h-4 w-4" /></summary>
            <AgencyIntelligenceOverview agency={agency} onOpenSources={openProfileSources} onNavigateSection={navigateProfileSection} />
          </details>
        )}

        {(activeSection === 'medicare' || activeSection === 'evidence') && (
        <section
          aria-label="Additional profile details"
          className="pi-surface space-y-4 p-4 sm:p-5"
        >
          <div>
            <h2 className="text-sm font-semibold text-[#14283F] dark:text-white">
              <DataLabel kind="agency">Additional profile details</DataLabel>
            </h2>
            <p className="mt-1 text-xs text-[#53657B] dark:text-slate-400">
              Registry identifiers, planning estimates, assessment context, and your review.
            </p>
          </div>
          <div
            ref={setProfileDetailsHost}
            className="flex flex-col gap-4"
            data-testid="profile-bottom-details"
          />
        </section>
        )}

          </div>
      </div>
      </main>

      {/* Sticky Account Quick-Action Bar aligned with the 256px desktop sidebar */}
      <aside 
        aria-label="Account Action Dock"
         data-testid="profile-action-dock"
         className="profile-mobile-dock fixed bottom-0 left-0 right-0 z-40 border-t border-[#DFE6EF] bg-white/95 px-2.5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all dark:border-[#1E2D42] dark:bg-[#111C2D]/95 print:hidden sm:left-64 sm:px-6 sm:py-2.5 lg:hidden"
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

          {/* The phone has one focused action dock. The full set of account tools
              remains in the header's More actions menu and on tablet/desktop. */}
          <div className="profile-phone-action-row sm:hidden" role="group" aria-label="Agency quick actions">
            <button type="button" onClick={() => navigateProfileSection('activity')} data-testid="button-profile-phone-notes" aria-label="Open agency notes and follow-ups">
              <FileText aria-hidden="true" />
              <span>Notes</span>
            </button>
            <button type="button" onClick={() => onToggleRoute(agency.id)} aria-pressed={agency.inDayRoute} data-testid="button-profile-phone-route" aria-label={agency.inDayRoute ? "Remove agency from today's route" : "Add agency to today's route"}>
              <Navigation aria-hidden="true" />
              <span>{agency.inDayRoute ? 'On route' : 'Route'}</span>
            </button>
            <button type="button" onClick={() => onToggleBookmark(agency.id)} aria-pressed={agency.isBookmarked} data-testid="button-profile-phone-save" aria-label={agency.isBookmarked ? 'Remove agency from saved work' : 'Save agency to My Work'}>
              <Bookmark aria-hidden="true" />
              <span>{agency.isBookmarked ? 'Saved' : 'Save'}</span>
            </button>
            <button type="button" onClick={() => setIsSourceDrawerOpen(true)} data-testid="button-profile-phone-sources" aria-label="Inspect agency sources">
              <ShieldCheck aria-hidden="true" />
              <span>Sources</span>
            </button>
          </div>
          {/* Tablet-specific extended action bar is unchanged. */}
          <div className="hidden w-full gap-1.5 sm:flex sm:w-auto sm:shrink-0 sm:flex-nowrap sm:items-center sm:gap-2">
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
                navigateProfileSection('deal_story');
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
              <div className="p-3.5 rounded-xl bg-[var(--pi-surface-subtle)] border border-[var(--pi-border)] space-y-1">
                <div
                  data-testid="profile-nppes-link-status"
                  className="font-semibold text-[var(--pi-text-primary)] flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4 text-[var(--pi-text-secondary)]" />
                  <span>{hasUserLinkedNppesRecord ? 'NPPES record linked by user' : 'No NPPES record linked by user'}</span>
                </div>
                <p
                  data-testid="profile-nppes-link-explanation"
                  className="text-[var(--pi-text-secondary)] leading-relaxed"
                >
                  The NPPES registry can return a legal-organization record for review. The app does not determine whether it belongs to this EMS or fire agency, whether an address is an operating station, or whether a listed official is operational command.
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
                  {agency.googleMapsUri&&<a
                    href={agency.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-3 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8] flex items-center justify-between font-medium text-[#14283F] dark:text-white transition-colors"
                  >
                    <span>Recorded provider address</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#285EE8]" />
                  </a>}
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
                {isVerifyingLive ? 'Searching…' : 'Search CMS NPPES'}
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
