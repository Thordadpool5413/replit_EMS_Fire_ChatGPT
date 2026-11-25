/** Immutable per-document review decisions. A blocking decision always overrides approval.
 * A corrected observation receives a new evidence ID and a separate review. */
export const DECISION_REASONS = {
  approved: ['source-checked'],
  challenged: ['source-conflict','identity-mismatch','scope-unclear','outdated','incorrect-value','unreliable-source'],
  withdrawn: ['source-retracted','incorrect-value','privacy-concern','unreliable-source'],
  superseded: ['corrected-evidence'],
} as const;
export type DecisionAction = keyof typeof DECISION_REASONS;
export const DECISION_ACTIONS = Object.keys(DECISION_REASONS) as DecisionAction[];
export type DecisionDraft = { action: DecisionAction; reason: string; replacementId: string };
export type EvidenceDecision = DecisionDraft & {
  factId: string;
  reviewerUid: string;
  reviewerIdentityMapped?: boolean;
  reviewedAt: string;
};
export type GovernanceStatus = 'pending' | DecisionAction | 'unavailable';
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
function obj(x:unknown): x is Record<string,unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }
export function validDecisionDraft(value:unknown, factId:string): value is DecisionDraft {
  if(!obj(value)||!idPattern.test(factId)||typeof value.action!=='string'||!Object.hasOwn(DECISION_REASONS,value.action))return false;
  const action=value.action as DecisionAction;
  if(typeof value.reason!=='string'||!(DECISION_REASONS[action] as readonly string[]).includes(value.reason)||typeof value.replacementId!=='string')return false;
  return action==='superseded'?idPattern.test(value.replacementId)&&value.replacementId!==factId:value.replacementId==='';
}
export function readDecision(value:unknown, factId:string, pathAction:string): EvidenceDecision|undefined {
  if(!obj(value)||!validDecisionDraft(value,factId))return;
  const raw=value as unknown as Record<string,unknown>;
  if(raw.action!==pathAction||raw.factId!==factId||typeof raw.reviewerUid!=='string'||!raw.reviewerUid.trim()||raw.reviewerUid.length>128||typeof raw.reviewedAt!=='string'||!Number.isFinite(Date.parse(raw.reviewedAt)))return;
  const v=value as EvidenceDecision;
  return {action:v.action,reason:v.reason,replacementId:v.replacementId,factId:v.factId,reviewerUid:v.reviewerUid,reviewedAt:v.reviewedAt};
}
export function summarizeDecisions(decisions:EvidenceDecision[], invalid=0): GovernanceStatus {
  if(invalid||new Set(decisions.map(d=>d.action)).size!==decisions.length)return 'unavailable';
  for(const action of ['withdrawn','superseded','challenged','approved'] as const)if(decisions.some(d=>d.action===action))return action;
  return 'pending';
}
export function sameDecision(a:EvidenceDecision,b:DecisionDraft,uid:string):boolean {
  return a.action===b.action&&a.reason===b.reason&&a.replacementId===b.replacementId&&a.reviewerUid===uid;
}
