import type {StreetAddress} from './providerLocationContract';
import {normalizedCity} from './addressNormalization';
import {selectNerisNativeAddress,validateNerisAddressComponent,nerisZip,sameNerisAddress,validNerisCoordinates,type NerisNativeAddress} from './nerisAddressComponent';

const SOURCE_SHA='1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b';
const INDEX_SHA='6047f5d0471a12dba0b3079d68deebb5399d87925f7546186267af193aef3b38';
const NATIONAL_SHA='6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca';
export const NERIS_PRIMARY_SITE_METHOD='neris-department-site-correlation' as const;
export type NerisPrimarySiteEvidence={
 method:typeof NERIS_PRIMARY_SITE_METHOD;association:'inferred';endUserValidationRequired:true;
 siteRole:'reported-headquarters'|'sole-reported-station';
 originalAddress:StreetAddress|null;originalStatus:'no-match'|'not-eligible'|'unavailable'|'pending'|'source-missing';
 sourceSha256:string;nerisIndexSha256:string;nationalRegistrySha256:string;
 correlation:{nameBasis:'normalized-complete-name-city-state-zip';primaryKey:string;primaryName:string;primaryCity:string;primaryPostalCode:string;normalizedName:string;normalizedCity:string;state:string;zip:string;reciprocalSourceCount:1;reciprocalPrimaryCount:1};
 department:{id:string;objectId:number;name:string;state:string;addressAsReported:NerisNativeAddress;coordinatesAsReported:[number,number]|null;reportedStationCount:number|null;observedStationCount:number};
 site:{id:string;objectId:number;sourceKind:'department'|'station';coordinatesAsReported:[number,number];addressAsReported:NerisNativeAddress};
};
export type NerisPrimarySiteContext={
 key:string;name:string;state:string;source:string;sourceCounty?:string;countyFips:string;
 address:StreetAddress;match:unknown;originalAddress:StreetAddress|null;nationalRow?:readonly string[];
};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=255):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const nativeId=(v:unknown):v is string=>typeof v==='string'&&/^[-A-Z0-9]{1,14}$/.test(v);
const positiveInt=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const countyPrefixes:Record<string,string>={AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'};
const sameArray=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const nameAliases:Record<string,string>={DEPT:'DEPARTMENT',DEPTS:'DEPARTMENTS',VOL:'VOLUNTEER',VFD:'VOLUNTEER FIRE DEPARTMENT',FD:'FIRE DEPARTMENT',CO:'COMPANY',DIST:'DISTRICT',TWP:'TOWNSHIP',ASSN:'ASSOCIATION',INCORPORATED:'INC'};
const genericNames=new Set('FIRE DEPARTMENT VOLUNTEER COMPANY DISTRICT AND RESCUE EMS EMERGENCY MEDICAL SERVICE SERVICES INC ASSOCIATION THE PROTECTION COMMUNITY'.split(' '));
export const nerisIdentityName=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).map(word=>nameAliases[word]??word).join(' ');
function originalAddress(value:unknown,state:string):value is StreetAddress|null{
 return value===null||obj(value)&&text(value.street,160)&&!!value.street&&text(value.city,100)&&!!value.city&&value.state===state&&typeof value.zip==='string'&&/^\d{5}$/.test(value.zip);
}

/**
 * Parsing alone checks the internal proof. Consumers must supply nationalRow or
 * the independently known originalAddress before attaching this to a listing.
 */
export function validateNerisPrimarySiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisPrimarySiteEvidence|undefined{
 if(value===undefined)return undefined;
 const fail=():never=>{throw Error('Invalid inferred NERIS primary-site evidence.');};
 if(!obj(value)||value.method!==NERIS_PRIMARY_SITE_METHOD||value.association!=='inferred'||value.endUserValidationRequired!==true||!['reported-headquarters','sole-reported-station'].includes(String(value.siteRole))||value.sourceSha256!==SOURCE_SHA||value.nerisIndexSha256!==INDEX_SHA||value.nationalRegistrySha256!==NATIONAL_SHA||!['no-match','not-eligible','unavailable','pending','source-missing'].includes(String(value.originalStatus)))return fail();
 if(ctx.source!=='USFA'||!ctx.key.startsWith('FDID:'+ctx.state+':')||!/^FDID:[A-Z]{2}:[-A-Z0-9.]{1,80}$/.test(ctx.key)||!countyPrefixes[ctx.state]||!/^\d{5}$/.test(ctx.countyFips)||!ctx.countyFips.startsWith(countyPrefixes[ctx.state])||ctx.sourceCounty&&ctx.sourceCounty!==ctx.countyFips)return fail();
 if(!originalAddress(value.originalAddress,ctx.state)||!originalAddress(ctx.originalAddress,ctx.state))return fail();
 if(value.originalAddress===null?ctx.originalAddress!==null:ctx.originalAddress===null||!sameNerisAddress(value.originalAddress,ctx.originalAddress))return fail();
 const c=value.correlation,d=value.department,s=value.site,m=ctx.match;
 if(!obj(c)||!obj(d)||!obj(s)||!obj(m)||!obj(m.point))return fail();
 if(c.nameBasis!=='normalized-complete-name-city-state-zip'||c.primaryKey!==ctx.key||c.primaryName!==ctx.name||!text(c.primaryName)||!text(c.primaryCity)||!c.primaryCity||!text(c.primaryPostalCode)||c.state!==ctx.state||typeof c.zip!=='string'||!/^\d{5}$/.test(c.zip)||nerisZip(c.primaryPostalCode)!==c.zip||c.reciprocalSourceCount!==1||c.reciprocalPrimaryCount!==1)return fail();
 const normalizedName=nerisIdentityName(c.primaryName),city=normalizedCity(c.primaryCity);
 if(!normalizedName||c.normalizedName!==normalizedName||c.normalizedCity!==city||!normalizedName.split(' ').some(word=>!genericNames.has(word))||!city)return fail();
 if(ctx.originalAddress&&(ctx.originalAddress.city!==c.primaryCity.trim()||ctx.originalAddress.zip!==c.zip))return fail();
 if(!nativeId(d.id)||!positiveInt(d.objectId)||!text(d.name)||!d.name||d.state!==ctx.state||nerisIdentityName(d.name)!==normalizedName||!(d.reportedStationCount===null||count(d.reportedStationCount))||!count(d.observedStationCount)||!(d.coordinatesAsReported===null||validNerisCoordinates(d.coordinatesAsReported)))return fail();
 const departmentAddress=selectNerisNativeAddress(d.addressAsReported),siteAddress=selectNerisNativeAddress(s.addressAsReported);
 if(!departmentAddress||!siteAddress||!Array.isArray(d.addressAsReported)||!Array.isArray(s.addressAsReported)||normalizedCity(departmentAddress.address.city)!==city||departmentAddress.address.state!==ctx.state||departmentAddress.address.zip!==c.zip||!siteAddress.component||siteAddress.conflict||siteAddress.address.state!==ctx.state||!siteAddress.address.city||!/^\d{5}$/.test(siteAddress.address.zip)||!sameNerisAddress(siteAddress.address,ctx.address))return fail();
 if(!nativeId(s.id)||!positiveInt(s.objectId)||!['department','station'].includes(String(s.sourceKind))||!validNerisCoordinates(s.coordinatesAsReported))return fail();
 const p=m.point;
 if(m.method!=='neris-reported-address'||m.matchBasis!=='normalized-street-city-state-zip'||!obj(m.sourceAddress)||!sameNerisAddress(m.sourceAddress as StreetAddress,ctx.address)||p.sourceSha256!==SOURCE_SHA||p.sourceDate!=='2026-11-26'||p.countyFips!==ctx.countyFips||p.nativeId!==s.id||p.objectId!==s.objectId||p.sourceKind!==s.sourceKind||p.parentId!==d.id||!validateNerisAddressComponent(p,ctx.address)||!Array.isArray(p.addressAsReported)||!sameArray(p.addressAsReported,s.addressAsReported)||!validNerisCoordinates(p.coordinatesAsReported)||!sameArray(p.coordinatesAsReported,s.coordinatesAsReported)||m.latitude!==s.coordinatesAsReported[0]||m.longitude!==s.coordinatesAsReported[1])return fail();
 if(value.siteRole==='reported-headquarters'){
  if(s.sourceKind!=='department'||s.id!==d.id||s.objectId!==d.objectId||!sameArray(s.addressAsReported,d.addressAsReported)||!validNerisCoordinates(d.coordinatesAsReported)||!sameArray(d.coordinatesAsReported,s.coordinatesAsReported))return fail();
 }else if(s.sourceKind!=='station'||!s.id.startsWith(d.id+'S')||d.reportedStationCount!==1||d.observedStationCount!==1||departmentAddress.hasPhysical)return fail();
 if(ctx.nationalRow){
  const row=ctx.nationalRow;
  if(row.length!==12||row[1]!=='USFA'||row[0]!=='usfa:'+ctx.state+':'+ctx.key.split(':').slice(2).join(':')||row[2]!==ctx.name||row[3]!==ctx.state||row[4]!==c.primaryCity||row[5]!==c.primaryPostalCode||row[6]!==ctx.sourceCounty||row[9])return fail();
  const street=row[10].trim();
  if(street?(value.originalAddress===null||value.originalAddress.street!==street):value.originalAddress!==null)return fail();
 }
 return value as NerisPrimarySiteEvidence;
}
