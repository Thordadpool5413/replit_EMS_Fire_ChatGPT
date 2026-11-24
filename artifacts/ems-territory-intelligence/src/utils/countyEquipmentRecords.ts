import {equipmentObservationFacts,definitionFor} from '../services/documentedIntelligence';
import type {
  Agency,
  AgencyFactEvidenceKey,
  AgencyGeographicLink,
  AgencySourceFact,
} from '../types';
import {
  EQUIPMENT_VENDORS,
  getRecordedEquipmentEntries,
  type EquipmentFamily,
  type EquipmentEvidenceMode,
  type RecordedEquipmentEntry,
} from './equipmentPresence';
import { hasMappedFactSource, hasReviewedFactEvidence } from '../data/agencyFactEvidence';

export type EquipmentRecordStatus = 'documented' | 'unverified';
export type AgencyEquipmentStatus = EquipmentRecordStatus | 'not-reported';
export type EquipmentRecordFamily = Exclude<EquipmentFamily, 'all'> | 'other';

export interface EquipmentEvidenceReference {
  sourceName: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  reportingPeriod?: string;
  effectivePeriod?: string;
  reviewedAt?: string;
  enteredAt?: string;
  basis?: AgencySourceFact['basis'] | 'agency-fact-evidence';
  reviewed: boolean;
}

export interface CountyEquipmentRecord {
  id: string;
  family: EquipmentRecordFamily;
  category: string;
  product: string;
  recordType: 'installed-field' | 'source-fact';
  manufacturers: string[];
  status: EquipmentRecordStatus;
  evidenceReview: 'reviewed' | 'review-needed' | 'source-not-mapped';
  evidence: EquipmentEvidenceReference[];
}

export interface CountyServiceAreaReference {
  label: string;
  geographyId?: string;
  sourceName?: string;
  sourceUrl?: string;
  reportingPeriod?: string;
  matchBasis?: AgencyGeographicLink['matchBasis'];
  documented: boolean;
}

export interface CountyAgencyEquipmentRecord {
  agencyId: string;
  agencyName: string;
  agency: Agency;
  agencyIdentityStatus: 'verified' | 'unverified';
  countyFips: string;
  countyName: string;
  assignmentBasis: 'source-fips' | 'canonical-name' | 'town-crosswalk' | 'unique-county-name';
  equipmentStatus: AgencyEquipmentStatus;
  /** Source-reported facts are shown separately and are not assumed to be installed today. */
  sourceFactRecordCount: number;
  equipmentRecords: CountyEquipmentRecord[];
  notReportedFamilies: Exclude<EquipmentFamily, 'all'>[];
  serviceAreas: CountyServiceAreaReference[];
}

const EQUIPMENT_FAMILIES: Exclude<EquipmentFamily, 'all'>[] = [
  'monitors',
  'cpr',
  'ventilators',
  'software',
];
const SOURCE_FACT_CATEGORIES: Partial<Record<AgencyFactEvidenceKey, {
  family: EquipmentRecordFamily;
  category: string;
}>> = {
  defibrillatorBiomedicalFleet: { family: 'monitors', category: 'Monitor / defibrillator' },
  equipmentSuppliers: { family: 'other', category: 'Equipment / supplier source fact' },
  verifiedHardware: { family: 'other', category: 'Hardware evidence source fact' },
  epcrSystem: { family: 'software', category: 'ePCR source fact' },
  communicationsSystems: { family: 'software', category: 'CAD / communications source fact' },
  billingSoftware: { family: 'software', category: 'Billing software source fact' },
  monitorModelTransition: { family: 'other', category: 'Monitor model / transition reference' },
};
const NON_EQUIPMENT_SOURCE_FACT = /^(?:not (?:reported|recorded|confirmed|deployed|available|specified)|unknown|n\/?a|none reported|no data)$/i;

const normalize = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function safeHttpsUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function addEvidence(
  target: Map<string, EquipmentEvidenceReference>,
  evidence: EquipmentEvidenceReference,
) {
  const key = [
    evidence.sourceRecordId ?? '',
    evidence.sourceName,
    evidence.sourceUrl ?? '',
    evidence.reportingPeriod ?? '',
    evidence.effectivePeriod ?? '',
    evidence.enteredAt ?? '',
  ].join('|');
  const previous = target.get(key);
  if (!previous) {
    target.set(key, evidence);
    return;
  }
  target.set(key, {
    ...previous,
    reviewed: previous.reviewed || evidence.reviewed,
    reviewedAt: previous.reviewedAt ?? evidence.reviewedAt,
  });
}

function equipmentEvidenceFor(
  agency: Agency,
  entry: RecordedEquipmentEntry,
  groupSourceFacts: AgencySourceFact[] = agency.sourceFacts ?? [],
): EquipmentEvidenceReference[] {
  const evidence = new Map<string, EquipmentEvidenceReference>();
  for (const key of entry.evidenceKeys) {
    const factEvidence = agency.factEvidence?.[key];
    if (factEvidence && hasMappedFactSource(factEvidence)) {
      addEvidence(evidence, {
        sourceName: factEvidence.sourceName,
        sourceRecordId: factEvidence.sourceRecordId,
        sourceUrl: safeHttpsUrl(factEvidence.sourceUrl),
        reportingPeriod: factEvidence.reportingPeriod,
        reviewedAt: factEvidence.reviewedAt,
        basis: 'agency-fact-evidence',
        reviewed: hasReviewedFactEvidence(factEvidence),
      });
    }

    for (const fact of groupSourceFacts) {
      if (!matchesEquipmentSourceFact(fact, agency, key, entry.value)) continue;
      addEvidence(evidence, {
        sourceName: fact.sourceName,
        sourceRecordId: fact.sourceRecordId,
        sourceUrl: safeHttpsUrl(fact.sourceUrl),
        reportingPeriod: fact.reportingPeriod,
        effectivePeriod: fact.effectivePeriod,
        enteredAt: fact.enteredAt,
        basis: fact.basis,
        reviewed: false,
      });
    }
  }
  return [...evidence.values()];
}

function matchesEquipmentSourceFact(
  fact: AgencySourceFact,
  agency: Agency,
  key: AgencyFactEvidenceKey,
  value: string,
): boolean {
  return fact.fieldKey === key
    && normalize(fact.value) === normalize(value)
    && fact.geographicLevel === 'agency'
    && fact.geographicId === agency.id
    && fact.basis !== 'calculated'
    && Boolean(fact.sourceName?.trim())
    && Boolean(fact.sourceRecordId?.trim());
}

function serviceAreaReferences(agencies: Agency[]): CountyServiceAreaReference[] {
  const references = new Map<string, CountyServiceAreaReference>();
  for (const agency of agencies) {
    for (const link of agency.geographicLinks ?? []) {
      if (link.relationship !== 'serves') continue;
      const documented = link.matchBasis === 'source-id' || link.matchBasis === 'user-confirmed';
      if (!documented) continue;
      const id = [
        link.sourceGeographyId ?? '',
        link.label,
        link.sourceName ?? '',
      ].join('|');
      references.set(id, {
        label: link.label,
        geographyId: link.sourceGeographyId,
        sourceName: link.sourceName,
        sourceUrl: safeHttpsUrl(link.sourceUrl),
        reportingPeriod: link.reportingPeriod,
        matchBasis: link.matchBasis,
        documented: true,
      });
    }
    for (const geographyId of agency.serviceAreaGeographyIds ?? []) {
      const hasDocumentedLink = [...references.values()].some(
        (reference) => reference.geographyId === geographyId && reference.documented,
      );
      if (!hasDocumentedLink) {
        references.set(`unlinked:${geographyId}`, {
          label: geographyId,
          geographyId,
          documented: false,
        });
      }
    }
  }
  return [...references.values()];
}

export function buildCountyAgencyEquipmentRecord(
  agencyId: string,
  agencies: Agency[],
  assignment: {
    countyFips: string;
    countyName: string;
    basis: CountyAgencyEquipmentRecord['assignmentBasis'];
  },
  evidenceMode:EquipmentEvidenceMode='recorded',
): CountyAgencyEquipmentRecord {
  const representative = agencies.find((agency) => agency.isVerifiedRecord)
    ?? agencies[0];
  if (!representative) {
    throw new Error(`Cannot build county equipment record without agency data: ${agencyId}`);
  }
  const equipmentByKey = new Map<string, CountyEquipmentRecord>();
  const groupSourceFacts = agencies.flatMap((agency) => agency.sourceFacts ?? []);
  if(evidenceMode==='documented'){
    const combined={...representative,sourceFacts:groupSourceFacts,_factReviews:agencies.flatMap(a=>a._factReviews??[])};
    for(const fact of equipmentObservationFacts(combined)){
      const def=definitionFor(fact.intelligence.kind)!;
      if(!def.family)continue;
      const key=def.family+':'+normalize(fact.value);
      const current=equipmentByKey.get(key);
      const sources=new Map<string,EquipmentEvidenceReference>();
      for(const prior of current?.evidence??[])addEvidence(sources,prior);
      addEvidence(sources,{sourceName:fact.sourceName,sourceRecordId:fact.sourceRecordId,sourceUrl:fact.sourceUrl,reportingPeriod:fact.intelligence.documentDate,enteredAt:fact.enteredAt,basis:fact.basis,reviewed:false});
      equipmentByKey.set(key,{id:agencyId+':'+key,family:def.family,category:def.label,product:fact.value,recordType:'source-fact',manufacturers:EQUIPMENT_VENDORS.filter(v=>v.pattern.test(fact.value)).map(v=>v.name),status:'documented',evidenceReview:'review-needed',evidence:[...sources.values()]});
    }
    const equipmentRecords=[...equipmentByKey.values()];
    return {agencyId,agencyName:representative.name||'Agency name not stated',agency:representative,agencyIdentityStatus:agencies.some(a=>a.isVerifiedRecord)?'verified':'unverified',countyFips:assignment.countyFips,countyName:assignment.countyName,assignmentBasis:assignment.basis,equipmentStatus:equipmentRecords.length?'documented':'not-reported',sourceFactRecordCount:equipmentRecords.length,equipmentRecords,notReportedFamilies:EQUIPMENT_FAMILIES.filter(f=>!equipmentRecords.some(r=>r.family===f)),serviceAreas:serviceAreaReferences(agencies)};
  }


  for (const agency of agencies) {
    for (const entry of getRecordedEquipmentEntries(agency)) {
      const key = `${entry.family}:${normalize(entry.value)}`;
      const evidence = equipmentEvidenceFor(agency, entry, groupSourceFacts);
      const current = equipmentByKey.get(key);
      const manufacturers = [...new Set([
        ...(current?.manufacturers ?? []),
        ...entry.manufacturerNames,
      ])];
      const mergedEvidence = new Map<string, EquipmentEvidenceReference>();
      for (const source of current?.evidence ?? []) addEvidence(mergedEvidence, source);
      for (const source of evidence) addEvidence(mergedEvidence, source);
      const allEvidence = [...mergedEvidence.values()];
      const status: EquipmentRecordStatus = allEvidence.length ? 'documented' : 'unverified';
      const isReviewed = allEvidence.some((source) => source.reviewed);

      equipmentByKey.set(key, {
        id: `${agencyId}:${key}`,
        family: entry.family,
        category: entry.label,
        product: entry.value,
        recordType: 'installed-field',
        manufacturers,
        status,
        evidenceReview: isReviewed
          ? 'reviewed'
          : allEvidence.length
            ? 'review-needed'
            : 'source-not-mapped',
        evidence: allEvidence,
      });
    }
  }

  for (const agency of agencies) {
    for (const fact of agency.sourceFacts ?? []) {
      const category = SOURCE_FACT_CATEGORIES[fact.fieldKey];
      if (
        !category
        || fact.geographicLevel !== 'agency'
        || fact.geographicId !== agency.id
        || fact.basis === 'calculated'
        || !fact.sourceName?.trim()
        || !fact.sourceRecordId?.trim()
        || !fact.value?.trim()
        || NON_EQUIPMENT_SOURCE_FACT.test(fact.value.trim())
      ) continue;

      const matchedInstalledEntry = agencies.some((candidate) =>
        getRecordedEquipmentEntries(candidate).some((entry) =>
          entry.evidenceKeys.includes(fact.fieldKey)
          && normalize(entry.value) === normalize(fact.value),
        ),
      );
      if (matchedInstalledEntry) continue;

      const key = `${category.family}:${normalize(fact.value)}`;
      const current = equipmentByKey.get(key);
      const source: EquipmentEvidenceReference = {
        sourceName: fact.sourceName,
        sourceRecordId: fact.sourceRecordId,
        sourceUrl: safeHttpsUrl(fact.sourceUrl),
        reportingPeriod: fact.reportingPeriod,
        effectivePeriod: fact.effectivePeriod,
        enteredAt: fact.enteredAt,
        basis: fact.basis,
        reviewed: false,
      };
      const evidence = new Map<string, EquipmentEvidenceReference>();
      for (const item of current?.evidence ?? []) addEvidence(evidence, item);
      addEvidence(evidence, source);
      const mergedEvidence = [...evidence.values()];
      const manufacturers = current?.manufacturers ?? EQUIPMENT_VENDORS
        .filter((vendor) => vendor.pattern.test(fact.value))
        .map((vendor) => vendor.name);
      equipmentByKey.set(key, {
        id: current?.id ?? `${agencyId}:${key}`,
        family: category.family,
        category: current?.category ?? category.category,
        product: current?.product ?? fact.value.trim(),
        recordType: current?.recordType ?? 'source-fact',
        manufacturers: [...new Set(manufacturers)],
        status: mergedEvidence.length ? 'documented' : 'unverified',
        evidenceReview: mergedEvidence.some((item) => item.reviewed)
          ? 'reviewed'
          : 'review-needed',
        evidence: mergedEvidence,
      });
    }
  }

  const equipmentRecords = [...equipmentByKey.values()];
  const installedRecords = equipmentRecords.filter((record) => record.recordType === 'installed-field');
  const sourceFactRecordCount = equipmentRecords.filter((record) => record.recordType === 'source-fact').length;
  const notReportedFamilies = EQUIPMENT_FAMILIES.filter(
    (family) => !installedRecords.some((record) => record.family === family),
  );
  const equipmentStatus: AgencyEquipmentStatus = installedRecords.length === 0
    ? 'not-reported'
    : installedRecords.every((record) => record.status === 'documented')
      ? 'documented'
      : 'unverified';

  return {
    agencyId,
    agencyName: representative?.name || 'Agency name not stated',
    agency: representative,
    agencyIdentityStatus: agencies.some((agency) => agency.isVerifiedRecord)
      ? 'verified'
      : 'unverified',
    countyFips: assignment.countyFips,
    countyName: assignment.countyName,
    assignmentBasis: assignment.basis,
    equipmentStatus,
    sourceFactRecordCount,
    equipmentRecords,
    notReportedFamilies,
    serviceAreas: serviceAreaReferences(agencies),
  };
}

export function getEquipmentRecordCounts(record: CountyAgencyEquipmentRecord) {
  const documented = record.equipmentRecords.filter((item) => item.status === 'documented').length;
  const unverified = record.equipmentRecords.length - documented;
  return {
    total: record.equipmentRecords.length,
    documented,
    unverified,
    notReported: record.equipmentStatus === 'not-reported',
  };
}
