import type { Agency } from '../types';
import { DAY_MS, EQUIPMENT_LOOKBACK_DAYS, PROCUREMENT_LOOKBACK_DAYS, definitionFor, normalizedValue, utcDay } from './documentedIntelligence';
import { readSharedEvidence, sameSharedEvidence, sharedAgencyKey, toSharedEvidence, type SharedEvidence } from './sharedEvidence';

export type EvidenceReviewStatus = 'review-candidate' | 'conflict' | 'historical' | 'stale' | 'superseded' | 'deadline-passed' | 'closed' | 'local-review-required' | 'incomplete';
export interface EvidenceReviewItem {
  evidence: SharedEvidence;
  origin: 'shared' | 'local';
  duplicates: number;
  status: EvidenceReviewStatus;
  reason: string;
}
export interface EvidenceReviewResult {
  complete: boolean;
  reason?: string;
  sharedCount: number;
  localCount: number;
  duplicates: number;
  invalid: number;
  items: EvidenceReviewItem[];
}
const norm = normalizedValue;
export const sharedObservationSignature = (e: SharedEvidence) => JSON.stringify([e.agencyKey,e.stateCode,e.kind,e.documentDate,norm(e.sourceName),e.sourceRecordId.trim(),e.sourceUrl,norm(e.value),e.dueDate]);
const signature = sharedObservationSignature;
const issuerRecord = (e: SharedEvidence) => JSON.stringify([norm(e.sourceName), e.sourceRecordId.trim()]);
const documentKey = (e: SharedEvidence) => JSON.stringify([issuerRecord(e), e.sourceUrl]);
const statusRank: Record<EvidenceReviewStatus,number> = {'conflict':0,'incomplete':1,'local-review-required':2,'deadline-passed':3,'stale':4,'superseded':5,'closed':6,'historical':7,'review-candidate':8};
function groups<T>(items:T[], key:(item:T)=>string):T[][] {
  const map = new Map<string,T[]>();
  for(const item of items){const k=key(item);const list=map.get(k);if(list)list.push(item);else map.set(k,[item]);}
  return [...map.values()];
}
function mark(rows:EvidenceReviewItem[],status:EvidenceReviewStatus,reason:string) {
  for(const row of rows)if(statusRank[status] <= statusRank[row.status]){row.status=status;row.reason=reason;}
}
function latest(rows:EvidenceReviewItem[]):EvidenceReviewItem[] {
  const date=rows.reduce((max,r)=>r.evidence.documentDate>max?r.evidence.documentDate:max,'');
  return rows.filter(r=>r.evidence.documentDate===date);
}
/** Read-only account review. Never promote this output into the provider record or a sales score. */
export function reconcileSharedEvidence(agency:Agency, shared:SharedEvidence[], scope:{singleCompletePage:boolean;withheld:number}, now=Date.now()):EvidenceReviewResult {
  const key=sharedAgencyKey(agency);
  const result:EvidenceReviewResult={complete:false,sharedCount:shared.length,localCount:0,duplicates:0,invalid:scope.withheld,items:[]};
  if(!key){result.reason='A source-native identity is required.';return result;}
  const input:{evidence:SharedEvidence;origin:'shared'|'local'}[]=[];
  for(const raw of shared){
    const e=readSharedEvidence(raw,key,raw.factId,now);
    if(!e||e.stateCode!==agency.stateCode){result.invalid++;continue;}
    input.push({evidence:e,origin:'shared'});
  }
  for(const f of agency.sourceFacts??[]){
    if(!f.intelligence)continue;
    try{input.push({evidence:toSharedEvidence(agency,f,now),origin:'local'});result.localCount++;}
    catch{result.invalid++;}
  }
  // A matching ID is an immutable identity, not permission to overwrite. Keep both versions when payloads differ.
  const byId=groups(input,r=>r.evidence.factId);
  const conflictingIds=new Set<string>();
  for(const group of byId)if(group.some(r=>!sameSharedEvidence(group[0].evidence,r.evidence)))conflictingIds.add(group[0].evidence.factId);
  // Do not collapse conflicting IDs into other observations. Prefer the shared copy for a genuine duplicate.
  const grouped=groups(input,r=>conflictingIds.has(r.evidence.factId)?JSON.stringify([r.origin,r.evidence]):signature(r.evidence));
  for(const group of grouped){
    const primary=group.find(r=>r.origin==='shared')??group[0];
    result.duplicates+=group.length-1;
    const item:EvidenceReviewItem={...primary,duplicates:group.length-1,status:'review-candidate',reason:'Dated observation; confirm the original source before acting.'};
    if(conflictingIds.has(primary.evidence.factId))mark([item],'conflict','Same immutable record ID has different payloads. Do not overwrite either record.');
    result.items.push(item);
  }
  if(!scope.singleCompletePage||result.invalid){
    result.reason=result.invalid?'One or more typed records could not be validated or matched to this account.':'This is a partial or paginated view. A complete account review cannot be inferred.';
    mark(result.items,'incomplete',result.reason);
    return result;
  }
  result.complete=true;
  const today=utcDay(now),day=Date.parse(today);
  const age=(e:SharedEvidence)=>day-Date.parse(e.documentDate);
  const equipment=result.items.filter(r=>definitionFor(r.evidence.kind)?.family);
  for(const group of groups(equipment,r=>r.evidence.kind)){
    const newest=latest(group);
    mark(group.filter(r=>!newest.includes(r)),'historical','A newer dated observation exists; this does not establish replacement or removal.');
    const docs=groups(newest,r=>documentKey(r.evidence));
    const sets=docs.map(doc=>JSON.stringify([...new Set(doc.map(r=>norm(r.evidence.value)))].sort()));
    if(new Set(sets).size>1||newest.some(r=>r.status==='conflict'))mark(newest,'conflict','Latest dated equipment documents disagree. Verify the inventory and scope.');
    else if(docs.some(doc=>new Set(doc.map(r=>norm(r.evidence.value))).size>1))mark(newest,'local-review-required','One document contains multiple equipment values. Confirm whether this is a mixed fleet or an entry error.');
    mark(newest.filter(r=>age(r.evidence)>EQUIPMENT_LOOKBACK_DAYS*DAY_MS),'stale','Equipment observation is older than the review window.');
  }
  const procurement=result.items.filter(r=>r.evidence.kind.startsWith('procurement-'));
  for(const group of groups(procurement,r=>issuerRecord(r.evidence))){
    const newest=latest(group), older=group.filter(r=>!newest.includes(r));
    const states=new Set(newest.map(r=>r.evidence.kind));
    const values=new Set(newest.map(r=>JSON.stringify([norm(r.evidence.value),r.evidence.dueDate])));
    if(states.size>1||values.size>1||newest.some(r=>r.status==='conflict')){
      mark(group,'conflict','Latest procurement documents disagree on status, scope or deadline. Review amendments.');
      continue;
    }
    const kind=newest[0].evidence.kind;
    mark(older,'historical','An updated document exists for this issuer and record ID.');
    if(kind==='procurement-closed'||kind==='procurement-awarded'){
      mark(older.filter(r=>r.evidence.kind==='procurement-open'),'superseded','A newer award or closure was recorded for this solicitation. Do not treat it as open.');
      if(kind==='procurement-closed')mark(newest,'closed','Published closure or cancellation; not an open solicitation.');
    } else if(older.some(r=>r.evidence.kind!=='procurement-open')){
      mark(newest,'local-review-required','Open status follows a recorded closure or award. Verify an official reopening.');
    }
    mark(newest.filter(r=>r.evidence.kind==='procurement-open'&&r.evidence.dueDate<today),'deadline-passed','The documented submission deadline has passed.');
    mark(newest.filter(r=>age(r.evidence)>PROCUREMENT_LOOKBACK_DAYS*DAY_MS),'stale','Procurement document is older than the review window.');
  }
  // Contracts, grants and appropriations can have separate record IDs; never conflate different contracts or issuers.
  const other=result.items.filter(r=>!definitionFor(r.evidence.kind)?.family&&!r.evidence.kind.startsWith('procurement-'));
  for(const group of groups(other,r=>JSON.stringify([r.evidence.kind,issuerRecord(r.evidence)]))){
    const newest=latest(group);
    if(new Set(newest.map(r=>norm(r.evidence.value))).size>1||newest.some(r=>r.status==='conflict')){
      mark(group,'conflict','Latest documents disagree for this issuer and record ID. Confirm the amendment or correct the citation.');
      continue;
    }
    mark(group.filter(r=>!newest.includes(r)),'historical','A newer document exists for this issuer and record ID.');
    mark(newest.filter(r=>r.evidence.kind==='contract-expiration'&&r.evidence.value<today),'deadline-passed','The published contract end date has passed; verify renewal or extension.');
    mark(newest.filter(r=>r.evidence.kind!=='contract-expiration'&&age(r.evidence)>PROCUREMENT_LOOKBACK_DAYS*DAY_MS),'stale','Funding observation is older than the review window.');
  }
  // Local fact flags never become a shared decision; they only caution the current reviewer.
  for(const row of result.items){
    const field=definitionFor(row.evidence.kind)?.reviewField;
    if(!field)continue;
    const review=(agency._factReviews??[]).filter(r=>r.agencyId===agency.id&&r.fieldId===field&&['confirm','correct','flag'].includes(r.action)&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=now).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
    if(review&&(review.action==='correct'||review.action==='flag')&&review.reviewedAt.slice(0,10)>=row.evidence.documentDate)mark([row],'local-review-required','A correction or flag on this device requires source review; it is not a shared decision.');
  }
  result.items.sort((a,b)=>statusRank[a.status]-statusRank[b.status]||b.evidence.documentDate.localeCompare(a.evidence.documentDate)||signature(a.evidence).localeCompare(signature(b.evidence))||a.evidence.factId.localeCompare(b.evidence.factId));
  return result;
}
