import {filterSourceDirectory,loadSourceDirectoryState,type SourceDirectoryManifest,type SourceDirectoryRecord} from './nationalSourceDirectory';
import {enrichRegistryRow,loadNationalLocationState,type LocationState} from './nationalLocationSnapshot';

export type PublicSearchScope={state:string;countyFips:string;city:string;zip:string;category:'all'|'ems'|'fire';query:string};
type Deps={loadState:(state:string)=>Promise<SourceDirectoryRecord[]>;loadLocations:(state:string)=>Promise<LocationState|undefined>};
export type PublicSearchResult={records:SourceDirectoryRecord[];failedStates:string[];locationUnavailable:boolean;statesSearched:number};
/** Public data search is independent of private account storage or cloud authentication.
 * Never build provider accounts or infer county, identity, or operating status. */
export async function searchPublicProviders(manifest:SourceDirectoryManifest,scope:PublicSearchScope,signal?:AbortSignal,deps:Deps={loadState:loadSourceDirectoryState,loadLocations:loadNationalLocationState}):Promise<PublicSearchResult>{
 const state=scope.state.toUpperCase(),selected=state!=='ALL';
 if(selected&&!Object.hasOwn(manifest.byState,state))throw Error('Choose a supported state.');
 if(scope.countyFips&&(!selected||!/^\d{5}$/.test(scope.countyFips)||!Object.hasOwn(manifest.countyNames,scope.countyFips)))throw Error('Choose a supported county.');
 if(scope.zip&&!/^\d{1,5}$/.test(scope.zip))throw Error('Enter a ZIP code using digits.');
 const states=selected?[state]:Object.keys(manifest.byState).sort();
 const records:SourceDirectoryRecord[]=[],failedStates:string[]=[];
 let cursor=0,locationUnavailable=false;
 const source=scope.category==='fire'?'USFA':scope.category==='ems'?'NPPES':'all';
 async function worker(){
  while(cursor<states.length){
   if(signal?.aborted)throw Error('Search canceled.');
   const code=states[cursor++];
   try{
    const raw=await deps.loadState(code);
    // State/county searches include the restored address and matched county data.
    // Nationwide searches use registry identity fields; enrich only the visible page later.
    const locations=selected?await deps.loadLocations(code):undefined;
    if(selected&&!locations)locationUnavailable=true;
    if(signal?.aborted)throw Error('Search canceled.');
    const enriched=selected?raw.map(r=>enrichRegistryRow(r,locations)):raw;
    records.push(...filterSourceDirectory(enriched,{source,query:scope.query,countyFips:scope.countyFips}).filter(r=>(!scope.city||r[4].trim().toLowerCase()===scope.city.trim().toLowerCase())&&(!scope.zip||r[5].startsWith(scope.zip))));
   }catch(error){if(signal?.aborted)throw error;failedStates.push(code);}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,states.length)},()=>worker()));
 records.sort((a,b)=>a[2].localeCompare(b[2])||a[3].localeCompare(b[3])||a[0].localeCompare(b[0]));
 return {records,failedStates:failedStates.sort(),locationUnavailable,statesSearched:states.length-failedStates.length};
}
