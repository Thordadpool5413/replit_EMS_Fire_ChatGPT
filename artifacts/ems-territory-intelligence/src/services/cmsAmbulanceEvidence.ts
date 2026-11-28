import type {Agency} from '../types';
import {registryClaims} from './registryAccountLink';
import {validateNpiCheckDigit} from './npiVerificationService';
const datasets = {
 2024: '335e5f35-eca6-482d-87b3-f99883e213e3',
 2023: '0e9f2f2b-7bf9-451a-912c-e02e654dd725',
} as const;
export const medicareSnapshotDataset = '92396110-2aed-4d63-a6a2-5d6207d46a29';
export type CmsReportingYear = keyof typeof datasets;
const source='https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider-and-service';
const codes=new Set(['A0422','A0424','A0425','A0426','A0427','A0428','A0429','A0430','A0431','A0432','A0433','A0434','A0435','A0436','A0888','A0998','A0999']);
export type CmsServiceRow={rowKey:string;npi:string;organizationName:string;city:string|null;state:string|null;providerType:string|null;hcpcs:string;description:string|null;placeOfService:'F'|'O';beneficiaries:number|null;services:number|null;beneficiaryDayServices:number|null;averageSubmittedCharge:number|null;averageAllowedAmount:number|null;averageMedicarePayment:number|null};
export type CmsServiceEvidence={schemaVersion:1;npi:string;datasetVersion:string;reportingYear:CmsReportingYear;sourceUrl:string;queryUrl:string;retrievedAt:string;status:'published-rows'|'no-published-rows';rows:CmsServiceRow[];endUserValidationRequired:true;operatingRelationshipEstablished:false;denialRateAvailable:false;totalClaimCountAvailable:false};
export function profileCmsLookupNpi(a:Agency):{npi:string|null;reason:string}{
 const claims=registryClaims(a);const keys=claims.keys.filter(k=>k.startsWith('NPI:')).map(k=>k.slice(4));
 const raw=a.npiNumber?.trim();if(raw)keys.push(raw);
 const ids=[...new Set(keys)];
 const invalidNpiClaim=(a.sourceRecordAssociations??[]).some(x=>x.sourceName==='NPPES'&&claims.invalid.includes(x.id));
 if(invalidNpiClaim||claims.conflicts.some(c=>c.some(k=>k.startsWith('NPI:')))||ids.length>1)return {npi:null,reason:'Conflicting provider identifiers; review the NPI before querying.'};
 if(ids.length!==1||!validateNpiCheckDigit(ids[0]).isValid)return {npi:null,reason:'No valid recorded NPI. State license information is not required for a federal lookup.'};
 return {npi:ids[0],reason:'Recorded NPI query only; operating relationship is not verified by CMS utilization.'};
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=400)=>v===null||typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const numeric=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
export function parseCmsServiceEvidence(v:unknown,npi:string,year:CmsReportingYear=2024, dataset: string = datasets[year]):CmsServiceEvidence{
 if(!obj(v)||v.schemaVersion!==1||v.npi!==npi||v.datasetVersion!==dataset||v.reportingYear!==year||v.sourceUrl!==source||typeof v.retrievedAt!=='string'||!Number.isFinite(Date.parse(v.retrievedAt))||!Array.isArray(v.rows)||v.rows.length>codes.size*2||v.endUserValidationRequired!==true||v.operatingRelationshipEstablished!==false||v.denialRateAvailable!==false||v.totalClaimCountAvailable!==false||v.status!==(v.rows.length?'published-rows':'no-published-rows')||typeof v.queryUrl!=='string')throw Error('Invalid CMS evidence response');
 const u=new URL(v.queryUrl);if(u.origin!=='https://data.cms.gov'||u.pathname!=='/data-api/v1/dataset/'+dataset+'/data'||u.searchParams.get('filter[Rndrng_NPI]')!==npi||u.username||u.password)throw Error('Unexpected CMS source link');
 const seen=new Set<string>();
 for(const r of v.rows){
  if(!obj(r)||r.npi!==npi||typeof r.hcpcs!=='string'||!codes.has(r.hcpcs)||!['F','O'].includes(String(r.placeOfService))||r.rowKey!==npi+':'+r.hcpcs+':'+r.placeOfService||typeof r.rowKey!=='string'||seen.has(r.rowKey)||typeof r.organizationName!=='string'||!text(r.organizationName)||!text(r.city,100)||!text(r.state,2)||!text(r.providerType,150)||!text(r.description)||!['beneficiaries','services','beneficiaryDayServices','averageSubmittedCharge','averageAllowedAmount','averageMedicarePayment'].every(k=>numeric(r[k])))throw Error('Invalid CMS service row');
  seen.add(r.rowKey);
 }
 return v as unknown as CmsServiceEvidence;
}
export async function loadCmsServiceEvidence(npi:string,signal?:AbortSignal,year:CmsReportingYear=2024){
 if(!validateNpiCheckDigit(npi).isValid)throw Error('Invalid NPI');
 const response=await fetch('/api/discovery/cms-ambulance-services?'+new URLSearchParams(year===2024?{npi}:{npi,year:String(year)}),{credentials:'include',cache:'no-store',signal});
 if(!response.ok)throw Error('CMS evidence unavailable. No claim values inferred.');
 return parseCmsServiceEvidence(await response.json(),npi,year);
}

type PackedService = [string, 'F' | 'O', number | null, number | null, number | null, number | null, number | null, number | null];
type MedicareEdition = {
  checked: string;
  dataset: string;
  codes: Record<string, string>;
  providers: Record<string, [string, string, string, string, PackedService[]]>;
};

const editions = new Map<string, Promise<MedicareEdition>>();

export async function loadMedicareSnapshot(npi: string) {
  if (!validateNpiCheckDigit(npi).isValid) return undefined;
  const prefix = npi[1];
  let pending = editions.get(prefix);
  if (!pending) {
    pending = fetch((import.meta.env?.BASE_URL ?? '/') + 'data/providers/medicare-2024-' + prefix + '.json', {
      signal: AbortSignal.timeout(20000),
    }).then(async (response) => {
      if (!response.ok) throw Error('Medicare snapshot unavailable');
      const edition = await response.json() as MedicareEdition;
      if (edition.dataset !== medicareSnapshotDataset || !edition.providers || !edition.codes) {
        throw Error('Invalid Medicare snapshot');
      }
      return edition;
    }).catch((error) => {
      editions.delete(prefix);
      throw error;
    });
    editions.set(prefix, pending);
  }

  const { checked, codes, providers } = await pending;
  const provider = providers[npi];
  if (!provider) return undefined;
  const [organizationName, city, state, providerType, values] = provider;
  const search = new URLSearchParams({ 'filter[Rndrng_NPI]': npi });
  return parseCmsServiceEvidence({
    schemaVersion: 1, npi, datasetVersion: medicareSnapshotDataset, reportingYear: 2024,
    sourceUrl: source, queryUrl: 'https://data.cms.gov/data-api/v1/dataset/' + medicareSnapshotDataset + '/data?' + search,
    retrievedAt: checked, status: 'published-rows', endUserValidationRequired: true,
    operatingRelationshipEstablished: false, denialRateAvailable: false, totalClaimCountAvailable: false,
    rows: values.map(([hcpcs, placeOfService, beneficiaries, services, beneficiaryDayServices, averageSubmittedCharge, averageAllowedAmount, averageMedicarePayment]) => ({
      rowKey: npi + ':' + hcpcs + ':' + placeOfService,
      npi, organizationName, city: city || null, state: state || null, providerType: providerType || null,
      hcpcs, description: codes[hcpcs] || null, placeOfService, beneficiaries, services,
      beneficiaryDayServices, averageSubmittedCharge, averageAllowedAmount, averageMedicarePayment,
    })),
  }, npi, 2024, medicareSnapshotDataset);
}

export const isCmsTransportService = (code: string) => /^(A042[6-9]|A043[0-4])$/.test(code);
