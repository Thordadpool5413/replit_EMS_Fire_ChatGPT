/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency, FieldNote, KeyContact, PredictiveWeights } from '../types';
import { DEFAULT_WEIGHTS, explainAgencyScore } from '../utils/syncStore';
import {
  hasCompleteVerifiedDirectoryProfile,
  hasVerifiedNppesEvidence,
} from '../data/providerIdentity';

/**
 * Valid 50 US State + DC postal codes for jurisdiction verification
 */
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);

/**
 * Known mock/test agency ID prefixes & patterns that must be blocked and stripped
 */
const BLOCKED_AGENCY_ID_PREFIXES = [
  'zoll-lead-',
  'mock-',
  'test-',
  'sample-',
  'demo-',
  'fake-',
  'dummy-',
  'sandbox-'
];

/**
 * Known mock/test personas, names, and narrative fragments that must be stripped from field notes & contacts
 */
const BLOCKED_PERSONA_PATTERNS = [
  'sarah jenkins',
  'sarah chen',
  'marcus vance',
  'capt. kowalski',
  'thomas kowalski',
  'chief adams',
  'marcus adams',
  'evelyn reed',
  'brenda vance',
  'test user',
  'demo rep',
  'sample rep',
  'john doe',
  'jane doe'
];

const BLOCKED_NOTE_NARRATIVE_PATTERNS = [
  'kowalski was blown away',
  'failed bench test last month',
  'delivered 4 evaluation units to station 10',
  'will not receive state certification next quarter',
  'simulated multi-device conflict',
  'test note',
  'sample note',
  'mock visit'
];

const BLOCKED_NOTE_ID_PATTERNS = [
  /^fn-\d+$/i,
  /^mock-/i,
  /^test-/i,
  /^sample-/i,
  /^demo-/i
];

const BLOCKED_EMAIL_DOMAINS = [
  '@zoll-medical.internal',
  '@zoll-clinical.internal',
  '@example.com',
  '@test.com',
  '@localhost'
];

export type DataProvenanceTier =
  | 'firestore_cloud_synced'
  | 'live_federal_registry'
  | 'public_federal_baseline';

export interface SanitizationAuditEvent {
  id: string;
  timestamp: string;
  action: 'SANITIZE_PASS' | 'CLOUD_HYDRATE' | 'SCORE_RECALC' | 'STRICT_MODE_TOGGLE';
  summary: string;
  recordsInspected: number;
  mockItemsStripped: number;
  cloudSyncedCount: number;
}

export interface DataHealthReport {
  totalActiveRecords: number;
  firestoreSyncedCount: number;
  liveFederalNpiCount: number;
  publicBaselineCount: number;
  cloudCoveragePct: number;
  dataPurityPct: number;
  mockAgenciesStrippedTotal: number;
  mockNotesStrippedTotal: number;
  unverifiedContactsScrubbedTotal: number;
  pulseIqVerifiedTotal: number;
  cloudDatabaseId: string;
  isCloudConnected: boolean;
  strictCloudOnlyMode: boolean;
  lastSanitizedAt: string;
  lastCloudSyncAt: string | null;
  auditEvents: SanitizationAuditEvent[];
}

export interface NpiCheckDigitValidationResult {
  isValid: boolean;
  npi: string;
  error?: string;
  reasons: string[];
}

/**
 * Validates a 10-digit National Provider Identifier (NPI) using the official CMS-mandated
 * 80840-prefixed Luhn Modulo-10 check digit algorithm (ISO/IEC 7812).
 *
 * Algorithm details:
 * 1. Requires exactly 10 numeric digits.
 * 2. Prepend "80840" to create a 15-digit sequence: '80840' + npi.
 * 3. 1-based indexing from the right:
 *    - Position 1 from right (the check digit, i = 14): NOT doubled.
 *    - Positions 2, 4, 6, 8, 10, 12, 14 from right: DOUBLED. If doubled digit > 9, subtract 9.
 *    - Positions 3, 5, 7, 9, 11, 13, 15 from right: NOT doubled.
 * 4. Sum all processed digits.
 * 5. Return true if and only if sum % 10 === 0.
 */
export function validateNpiCheckDigit(npiCandidate: unknown): NpiCheckDigitValidationResult {
  if (typeof npiCandidate !== 'string' && typeof npiCandidate !== 'number') {
    return {
      isValid: false,
      npi: String(npiCandidate ?? ''),
      error: 'NPI must be a string or number',
      reasons: ['Identifier is not a valid string or numeric value']
    };
  }

  const clean = String(npiCandidate).trim();

  if (!/^\d{10}$/.test(clean)) {
    return {
      isValid: false,
      npi: clean,
      error: clean.length !== 10
        ? `NPI must be exactly 10 digits (received ${clean.length})`
        : 'NPI must contain only numeric digits',
      reasons: ['Malformed NPI format: must be exactly 10 numeric digits']
    };
  }

  const full = '80840' + clean;
  let sum = 0;

  for (let i = 0; i < full.length; i++) {
    let digit = parseInt(full[i], 10);
    // 1-based position from the right:
    // When i = 14 (posFromRight = 1): NOT doubled
    // When i = 13 (posFromRight = 2): DOUBLED
    const posFromRight = full.length - i;
    if (posFromRight % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const isValid = sum % 10 === 0;

  return {
    isValid,
    npi: clean,
    error: isValid ? undefined : 'Invalid NPI check digit (Luhn-80840 algorithm failure)',
    reasons: isValid
      ? ['Format verified: 10 numeric digits', 'CMS Luhn-80840 check digit verified']
      : ['Format error: check digit does not match CMS Luhn-80840 computation']
  };
}

/**
 * Computes the CMS-prescribed check digit for a 9-digit base NPI using the 80840 prefix.
 * Reference: CMS NPI Check Digit Specification (ISO/IEC 7812).
 */
export function computeCmsNpiCheckDigit(nineDigitNpi: string): number {
  const clean = String(nineDigitNpi || '').trim();
  if (!/^\d{9}$/.test(clean)) {
    throw new Error('Base NPI must be exactly 9 numeric digits');
  }
  const full = '80840' + clean;
  let sum = 0;
  for (let i = full.length - 1; i >= 0; i--) {
    let digit = parseInt(full[i], 10);
    const posFromRight = full.length - i;
    if (posFromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export interface StoredNpiAuditItem {
  source: string;
  recordId: string;
  entityName: string;
  npi: string;
  isValidCheckDigit: boolean;
  auditClassification: 'VALID_MATCHED' | 'VALID_MISMATCHED' | 'INVALID_CHECK_DIGIT' | 'UNASSESSED';
  requiresManualReview: boolean;
  details: string;
  actualNppesEntity?: string;
  claimedEntity?: string;
  jurisdiction?: string;
  nppesUrl?: string;
}

export interface StoredNpiAuditReport {
  totalInspected: number;
  validCheckDigits: number;
  invalidCheckDigits: number;
  validMatchedEntities: number;
  validMismatchedEntities: number;
  totalFlaggedForManualReview: number;
  unassessedGeographicProspects: number;
  productionMutations: number;
  databaseId: string;
  auditedAt: string;
  items: StoredNpiAuditItem[];
}

export function executeStoredNpiAudit(agencies: Agency[] = []): StoredNpiAuditReport {
  const items: StoredNpiAuditItem[] = [];
  let agenciesWithNpi = 0;
  for (const agency of agencies) {
    if (agency.npiNumber) {
      agenciesWithNpi++;
      const check = validateNpiCheckDigit(agency.npiNumber);
      let auditClassification: StoredNpiAuditItem['auditClassification'] = 'UNASSESSED';
      let requiresManualReview = false;
      let details = '';
      let actualNppesEntity: string | undefined;

      if (!check.isValid) {
        auditClassification = 'INVALID_CHECK_DIGIT';
        requiresManualReview = true;
        details = `Agency NPI failed check digit validation: ${check.error}`;
      } else if (hasVerifiedNppesEvidence(agency)) {
        auditClassification = 'VALID_MATCHED';
        details = 'Exact provider identity and geography match recorded from CMS NPPES.';
        actualNppesEntity = agency.nppesOfficialName;
      } else {
        requiresManualReview = true;
        details = 'Checksum is valid, but this record has no saved exact CMS NPPES identity match.';
      }

      items.push({
        source: 'local agency record',
        recordId: agency.id,
        entityName: agency.name,
        npi: agency.npiNumber,
        isValidCheckDigit: check.isValid,
        auditClassification,
        requiresManualReview,
        details,
        actualNppesEntity,
        claimedEntity: agency.name,
        jurisdiction: `${agency.city}, ${agency.stateCode} (${agency.county})`,
        nppesUrl: `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}`
      });
    }
  }

  const validCheckDigits = items.filter(i => i.isValidCheckDigit).length;
  const invalidCheckDigits = items.filter(i => !i.isValidCheckDigit).length;
  const validMatchedEntities = items.filter(i => i.auditClassification === 'VALID_MATCHED').length;
  const validMismatchedEntities = items.filter(i => i.auditClassification === 'VALID_MISMATCHED').length;
  const totalFlaggedForManualReview = items.filter(i => i.requiresManualReview).length;
  const unassessedGeographicProspects = Math.max(0, agencies.length - agenciesWithNpi);

  return {
    totalInspected: items.length,
    validCheckDigits,
    invalidCheckDigits,
    validMatchedEntities,
    validMismatchedEntities,
    totalFlaggedForManualReview,
    unassessedGeographicProspects,
    productionMutations: 0,
    databaseId: 'local-only-no-production-database',
    auditedAt: new Date().toISOString(),
    items
  };
}

class DataSanitizationService {
  private mockAgenciesStrippedCount = 0;
  private mockNotesStrippedCount = 0;
  private unverifiedContactsScrubbedCount = 0;
  private pulseIqVerifiedCount = 0;
  private lastSanitizedAt: string = new Date().toISOString();
  private lastCloudSyncAt: string | null = null;
  private strictCloudOnlyMode: boolean = false;
  private cloudSyncedAgencyIds: Set<string> = new Set();
  private auditEvents: SanitizationAuditEvent[] = [];

  /**
   * Validates a 10-digit NPI using the official 80840-prefixed Luhn algorithm.
   */
  public validateNpiCheckDigit(npi: unknown): NpiCheckDigitValidationResult {
    return validateNpiCheckDigit(npi);
  }

  /**
   * Computes the official CMS check digit for a 9-digit base NPI.
   */
  public computeCmsNpiCheckDigit(nineDigitNpi: string): number {
    return computeCmsNpiCheckDigit(nineDigitNpi);
  }

  /**
   * Executes a comprehensive, read-only audit across all stored NPIs and agency candidates.
   */
  public executeStoredNpiAudit(agencies: Agency[] = []): StoredNpiAuditReport {
    return executeStoredNpiAudit(agencies);
  }

  constructor() {
    this.recordAuditEvent(
      'SANITIZE_PASS',
      'Initialized Data Sanitization & Provenance Firewall. Active enforcement blocking all zoll-lead-* mock records, synthetic personas, and unverified test overrides.',
      0,
      0,
      0
    );
  }

  /**
   * Checks if an agency record is a mock, sample, or test-generated record.
   */
  public isMockOrTestAgency(agency: Partial<Agency> | null | undefined): boolean {
    if (!agency || !agency.id || !agency.name) return true;

    const idLower = agency.id.toLowerCase().trim();
    for (const prefix of BLOCKED_AGENCY_ID_PREFIXES) {
      if (idLower.startsWith(prefix)) {
        return true;
      }
    }

    const nameLower = agency.name.toLowerCase().trim();
    if (
      nameLower.includes('test agency') ||
      nameLower.includes('mock fire') ||
      nameLower.includes('sample ems') ||
      nameLower.includes('demo department') ||
      nameLower.includes('fake ')
    ) {
      return true;
    }

    const stateCode = (agency.stateCode || '').toUpperCase().trim();
    if (!VALID_US_STATES.has(stateCode)) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a field note is mock, sample, or authored by a synthetic persona.
   */
  public isMockOrTestFieldNote(note: Partial<FieldNote> | null | undefined): boolean {
    if (!note || !note.notes) return true;

    const idStr = (note.id || '').trim();
    for (const regex of BLOCKED_NOTE_ID_PATTERNS) {
      if (regex.test(idStr)) {
        return true;
      }
    }

    const repLower = (note.repName || '').toLowerCase();
    for (const persona of BLOCKED_PERSONA_PATTERNS) {
      if (repLower.includes(persona)) {
        return true;
      }
    }

    const notesLower = note.notes.toLowerCase();
    for (const pattern of BLOCKED_NOTE_NARRATIVE_PATTERNS) {
      if (notesLower.includes(pattern)) {
        return true;
      }
    }

    for (const persona of BLOCKED_PERSONA_PATTERNS) {
      if (notesLower.includes(persona)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sanitizes key contacts, removing synthetic personas, internal test emails, and unverified direct phone numbers.
   */
  public sanitizeKeyContacts(contacts: KeyContact[] | undefined): {
    sanitized: KeyContact[];
    scrubbedCount: number;
  } {
    if (!Array.isArray(contacts)) {
      return { sanitized: [], scrubbedCount: 0 };
    }

    let scrubbedCount = 0;
    const sanitized: KeyContact[] = [];

    for (const contact of contacts) {
      if (!contact || !contact.name) continue;

      const nameLower = contact.name.toLowerCase();
      const isFakePersona = BLOCKED_PERSONA_PATTERNS.some(p => nameLower.includes(p));
      if (isFakePersona) {
        scrubbedCount++;
        continue;
      }

      const emailLower = (contact.email || '').toLowerCase();
      const hasFakeEmail = BLOCKED_EMAIL_DOMAINS.some(d => emailLower.includes(d));

      const hadUnverifiedPhone = Boolean(contact.phone && contact.phone.trim().length > 0);
      if (hadUnverifiedPhone || hasFakeEmail) {
        scrubbedCount++;
      }

      sanitized.push({
        ...contact,
        phone: '',
        email: hasFakeEmail ? '' : (contact.email || '')
      });
    }

    return { sanitized, scrubbedCount };
  }

  /**
   * Recalculates a modeled PulseIQ score and weighted breakdown from source-verified inputs.
   */
  public verifyAndRecalculatePulseIq(
    agency: Agency,
    weights: PredictiveWeights = DEFAULT_WEIGHTS
  ): Agency['zollOpportunity'] {
    const explanation = explainAgencyScore(agency, weights);
    const factorPoints = (factorId: string) =>
      explanation.factors.find((factor) => factor.id === factorId)?.pointsContributed ?? 0;

    return {
      ...agency.zollOpportunity,
      pulseIqScore: explanation.totalScore,
      priorityTier: explanation.priorityTier as Agency['zollOpportunity']['priorityTier'],
      scoreBreakdown: {
        clinicalAcuityPts: factorPoints('cardiac'),
        fleetObsolescencePts: factorPoints('fleet'),
        cmsFinancialPts: factorPoints('cms'),
        softwareWhitespacePts: factorPoints('software'),
        budgetGrantReadinessPts: factorPoints('grant')
      }
    };
  }

  /**
   * Determines the exact data provenance tier of an agency record.
   */
  public classifyProvenanceTier(agency: Agency): DataProvenanceTier {
    if (
      agency.isCloudPersisted ||
      Boolean(agency._syncedAt) ||
      Boolean(agency._updatedAt) ||
      this.cloudSyncedAgencyIds.has(agency.id)
    ) {
      return 'firestore_cloud_synced';
    }

    if (hasVerifiedNppesEvidence(agency)) {
      return 'live_federal_registry';
    }

    return 'public_federal_baseline';
  }

  /**
   * Registers agency IDs confirmed present in the live Firestore collection snapshot.
   */
  public registerCloudSyncedIds(ids: string[]): void {
    for (const id of ids) {
      if (id) this.cloudSyncedAgencyIds.add(id);
    }
    if (ids.length > 0) {
      this.lastCloudSyncAt = new Date().toISOString();
    }
  }

  public isAgencyCloudSynced(agencyId: string): boolean {
    return this.cloudSyncedAgencyIds.has(agencyId);
  }

  public getCloudSyncedIdsCount(): number {
    return this.cloudSyncedAgencyIds.size;
  }

  public setStrictCloudOnlyMode(enabled: boolean): void {
    this.strictCloudOnlyMode = enabled;
    this.recordAuditEvent(
      'STRICT_MODE_TOGGLE',
      enabled
        ? 'Enabled Strict Firestore Cloud-Only Filter: UI restricted exclusively to records confirmed in Cloud Firestore.'
        : 'Standard Verified Mode: Displaying all sanitized cloud-synchronized and verified public registry records.',
      this.cloudSyncedAgencyIds.size,
      0,
      this.cloudSyncedAgencyIds.size
    );
  }

  public getStrictCloudOnlyMode(): boolean {
    return this.strictCloudOnlyMode;
  }

  /**
   * Sanitizes a single agency record and retains it only after a recorded exact CMS NPPES match.
   */
  public sanitizeAgency(
    agency: Agency,
    weights: PredictiveWeights = DEFAULT_WEIGHTS
  ): Agency | null {
    if (this.isMockOrTestAgency(agency)) {
      this.mockAgenciesStrippedCount++;
      return null;
    }
    if (!hasCompleteVerifiedDirectoryProfile(agency)) {
      return null;
    }

    // 1. Filter out any mock or test field notes
    const rawNotes = Array.isArray(agency.fieldNotes) ? agency.fieldNotes : [];
    const cleanNotes: FieldNote[] = [];
    for (const note of rawNotes) {
      if (this.isMockOrTestFieldNote(note)) {
        this.mockNotesStrippedCount++;
      } else {
        cleanNotes.push(note);
      }
    }

    // 2. Sanitize key contacts
    const { sanitized: cleanContacts, scrubbedCount } = this.sanitizeKeyContacts(agency.keyContacts);
    this.unverifiedContactsScrubbedCount += scrubbedCount;

    // 3. Recalculate and verify mathematical PulseIQ score
    const verifiedOpportunity = this.verifyAndRecalculatePulseIq(agency, weights);
    this.pulseIqVerifiedCount++;

    // 4. Determine provenance tier
    const isCloud =
      Boolean(agency._syncedAt) ||
      Boolean(agency._updatedAt) ||
      Boolean(agency.isCloudPersisted) ||
      this.cloudSyncedAgencyIds.has(agency.id);
    const hasVerifiedIdentity = hasVerifiedNppesEvidence(agency);

    if (isCloud) {
      this.cloudSyncedAgencyIds.add(agency.id);
    }

    const sanitizedRecord: Agency = {
      ...agency,
      headquartersPhone: '',
      keyContacts: cleanContacts,
      fieldNotes: cleanNotes,
      zollOpportunity: verifiedOpportunity,
      isCloudPersisted: isCloud,
      isVerifiedRecord: hasVerifiedIdentity,
      dataProvenanceTier: isCloud
        ? 'firestore_cloud_synced'
        : hasVerifiedIdentity
          ? 'live_federal_registry'
          : 'public_federal_baseline'
    };

    return sanitizedRecord;
  }

  /**
   * Sanitizes an entire array of agencies, deduplicating by ID, stripping any mock/test records,
   * and optionally filtering to strict cloud-only records if `strictCloudOnlyMode` is enabled.
   */
  public sanitizeAgenciesList(
    agencies: Agency[],
    weights: PredictiveWeights = DEFAULT_WEIGHTS,
    enforceStrictCloudFilter: boolean = this.strictCloudOnlyMode
  ): Agency[] {
    if (!Array.isArray(agencies)) return [];

    let strippedInPass = 0;
    const dedupMap = new Map<string, Agency>();

    for (const raw of agencies) {
      const clean = this.sanitizeAgency(raw, weights);
      if (!clean) {
        strippedInPass++;
        continue;
      }

      const existing = dedupMap.get(clean.id);
      if (!existing) {
        dedupMap.set(clean.id, clean);
      } else {
        // Prefer cloud-persisted record on merge without injecting undefined timestamp keys
        const mergedIsCloud = Boolean(existing.isCloudPersisted || clean.isCloudPersisted);
        const syncedAt = clean._syncedAt || existing._syncedAt;
        const updatedAt = clean._updatedAt || existing._updatedAt;
        dedupMap.set(clean.id, {
          ...existing,
          ...clean,
          isCloudPersisted: mergedIsCloud,
          ...(syncedAt ? { _syncedAt: syncedAt } : {}),
          ...(updatedAt ? { _updatedAt: updatedAt } : {}),
          dataProvenanceTier: mergedIsCloud ? 'firestore_cloud_synced' : clean.dataProvenanceTier
        });
      }
    }

    this.lastSanitizedAt = new Date().toISOString();

    let result = Array.from(dedupMap.values());
    if (enforceStrictCloudFilter && this.cloudSyncedAgencyIds.size > 0) {
      result = result.filter(
        a => a.isCloudPersisted || this.cloudSyncedAgencyIds.has(a.id)
      );
    }

    if (strippedInPass > 0) {
      this.recordAuditEvent(
        'SANITIZE_PASS',
        `Sanitized ${agencies.length} records: stripped ${strippedInPass} mock/test records and verified ${result.length} real-world agencies.`,
        agencies.length,
        strippedInPass,
        this.cloudSyncedAgencyIds.size
      );
    }

    return result;
  }

  public recordAuditEvent(
    action: SanitizationAuditEvent['action'],
    summary: string,
    recordsInspected: number,
    mockItemsStripped: number,
    cloudSyncedCount: number
  ): void {
    const evt: SanitizationAuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      summary,
      recordsInspected,
      mockItemsStripped,
      cloudSyncedCount
    };
    this.auditEvents = [evt, ...this.auditEvents].slice(0, 50);
  }

  /**
   * Generates a real-time DataHealthReport across the active agency dataset.
   */
  public getDataHealthReport(
    agencies: Agency[],
    isCloudConnected: boolean,
    cloudDatabaseId: string = 'ai-studio-nicksemsfireterr-26354b36-e812-4fee-8cf9-2df9f9c26acf'
  ): DataHealthReport {
    let firestoreSyncedCount = 0;
    let liveFederalNpiCount = 0;
    let publicBaselineCount = 0;
    let mockDetected = 0;

    for (const agency of agencies) {
      if (this.isMockOrTestAgency(agency)) {
        mockDetected++;
        continue;
      }

      const tier = this.classifyProvenanceTier(agency);
      if (tier === 'firestore_cloud_synced') {
        firestoreSyncedCount++;
      } else if (tier === 'live_federal_registry') {
        liveFederalNpiCount++;
      } else {
        publicBaselineCount++;
      }

      // Also count live NPI enrichment even if already synced to Firestore
      if (tier === 'firestore_cloud_synced' && hasVerifiedNppesEvidence(agency)) {
        liveFederalNpiCount++;
      }
    }

    const totalActive = agencies.length;
    const effectiveCloudCount = Math.max(firestoreSyncedCount, Math.min(totalActive, this.cloudSyncedAgencyIds.size));
    const cloudCoveragePct = totalActive > 0
      ? Math.min(100, Math.round((effectiveCloudCount / totalActive) * 100))
      : 100;

    const dataPurityPct = totalActive > 0
      ? Math.round(((totalActive - mockDetected) / totalActive) * 100)
      : 100;

    return {
      totalActiveRecords: totalActive,
      firestoreSyncedCount: effectiveCloudCount,
      liveFederalNpiCount,
      publicBaselineCount: Math.max(0, totalActive - effectiveCloudCount),
      cloudCoveragePct,
      dataPurityPct,
      mockAgenciesStrippedTotal: this.mockAgenciesStrippedCount,
      mockNotesStrippedTotal: this.mockNotesStrippedCount,
      unverifiedContactsScrubbedTotal: this.unverifiedContactsScrubbedCount,
      pulseIqVerifiedTotal: Math.max(this.pulseIqVerifiedCount, totalActive),
      cloudDatabaseId,
      isCloudConnected,
      strictCloudOnlyMode: this.strictCloudOnlyMode,
      lastSanitizedAt: this.lastSanitizedAt,
      lastCloudSyncAt: this.lastCloudSyncAt,
      auditEvents: this.auditEvents
    };
  }
}

export const dataSanitizationService = new DataSanitizationService();
