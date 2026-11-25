/** User-entered evidence only. No inferred manufacturer, ownership or fleet size. */
export const EQUIPMENT_FAMILIES=["monitors","cpr","ventilators","software"] as const;
export const EQUIPMENT_MAKERS=["zoll","stryker","philips","hamilton","weinmann","draeger","medtronic","mindray","schiller","nihon-kohden","eso","imagetrend","other","unknown"] as const;
type Family=typeof EQUIPMENT_FAMILIES[number];
type Maker=typeof EQUIPMENT_MAKERS[number];
export type StationEquipmentObservation={family:Family;maker:Maker;model:string;apparatus:string;observedOn:string;basis:"direct-observation"|"public-document";sourceUrl:string;description:string};
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const nativeId=/^[-A-Z0-9]{1,14}$/;
export function object(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function clean(v:unknown,limit:number):string|undefined{
 if(typeof v!=="string"||v.length>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))return undefined;
 return v.trim();
}
function publicUrl(v:string):boolean{
 try{const u=new URL(v);return u.protocol==="https:"&&!!u.hostname&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==="443");}catch{return false;}
}
export function parseObservation(v:unknown,today=new Date().toISOString().slice(0,10)):StationEquipmentObservation|undefined{
 const p=object(v),family=p.family as Family,maker=p.maker as Maker,basis=p.basis;
 if(!EQUIPMENT_FAMILIES.includes(family)||!EQUIPMENT_MAKERS.includes(maker)||(basis!=="direct-observation"&&basis!=="public-document"))return undefined;
 const model=clean(p.model,120),apparatus=clean(p.apparatus,120),description=clean(p.description,2000),observedOn=clean(p.observedOn,10),sourceUrl=clean(p.sourceUrl,1500);
 if(model===undefined||apparatus===undefined||!description||!observedOn||sourceUrl===undefined||!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)||observedOn>today||observedOn<"1900-01-01")return undefined;
 const date=new Date(observedOn+"T00:00:00Z");if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==observedOn)return undefined;
 if(basis==="public-document"?!publicUrl(sourceUrl):sourceUrl!=="")return undefined;
 return {family,maker,model,apparatus,description,observedOn,basis,sourceUrl};
}
export function parseDecision(v:unknown){
 const p=object(v),note=clean(p.note,1000);
 if((p.decision!=="accepted"&&p.decision!=="rejected")||!note||p.attested!==true)return undefined;
 return {decision:p.decision,note} as const;
}
