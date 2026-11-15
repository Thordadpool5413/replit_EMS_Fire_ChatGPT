import type { Agency } from '../types';
export const getRecordOrigin=(a:Agency)=>a.verificationSource?.includes('Geographic prospect generator')?'Generated prospect':'Imported record';
/** Protect spreadsheet users from executing record values as formulas. */
const csvCell=(value:unknown)=>{
  let text=value==null?'':String(value);
  if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
};
export function buildWorkspaceCsv(agencies:Agency[],exportedAt=new Date().toISOString()):string {
  const columns=['Agency','Agency ID','State','County','City','Record origin','Review requirement','Monitor model','Monitor quantity','Sales stage','Latest interaction','Next action','Follow-up date','User corrections applied','Exported at'];
  const rows=agencies.map(a=>{
    const last=[...(a.fieldNotes??[])].sort((x,y)=>y.date.localeCompare(x.date))[0];
    return [a.name,a.id,a.stateCode,a.county,a.city,getRecordOrigin(a),'End-user validation required',a.installedFleet?.defibBrand,a.installedFleet?.defibUnitsCount,a.zollOpportunity?.salesStage,last?.date,last?.nextAction,last?.dueDate,Object.keys(a._reviewOriginalValues??{}).join('; '),exportedAt];
  });
  return [columns,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
