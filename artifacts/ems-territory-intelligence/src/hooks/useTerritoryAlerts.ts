import {useEffect,useMemo,useState} from 'react';
import type {Agency} from '../types';
import {utcDay} from '../services/documentedIntelligence';
import {localDay} from '../utils/followUps';
import {loadRecurringDiscovery} from '../services/recurringDiscovery';
import type {DiscoveryFeed} from '../services/recurringDiscoveryContract';
import {buildLocalTerritoryAlerts,buildPublicTerritoryAlerts,combineTerritoryAlerts} from '../services/territoryAlerts';
const REFRESH_MS=15*60_000;
export function useTerritoryAlerts(agencies:Agency[],online:boolean){
 const [clock,setClock]=useState(Date.now),[feed,setFeed]=useState<DiscoveryFeed>(),[phase,setPhase]=useState<'idle'|'loading'|'ready'|'unavailable'>('idle'),[refreshKey,setRefreshKey]=useState(0);
 const utc=utcDay(clock),local=localDay(new Date(clock));
 useEffect(()=>{const update=()=>setClock(Date.now());const t=window.setInterval(update,60_000);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);return()=>{window.clearInterval(t);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};},[]);
 useEffect(()=>{
  let active=true,lastAttempt=0,request:AbortController|undefined;
  function cancel(){request?.abort();request=undefined;}
  if(!online){setFeed(undefined);setPhase('idle');return;}
  async function check(){
   if(!active||!navigator.onLine||document.visibilityState!=='visible'||request||Date.now()-lastAttempt<REFRESH_MS)return;
   lastAttempt=Date.now();const controller=new AbortController();request=controller;
   setPhase('loading');setFeed(undefined);
   try{
    const data=await loadRecurringDiscovery(controller.signal);
    if(!active||request!==controller||controller.signal.aborted||!navigator.onLine||document.visibilityState!=='visible')return;
    setClock(Date.now());setFeed(data);setPhase('ready');
   }catch{
    if(active&&request===controller&&!controller.signal.aborted){setFeed(undefined);setPhase('unavailable');}
   }finally{if(request===controller)request=undefined;}
  }
  const visibility=()=>{if(document.visibilityState!=='visible'){cancel();lastAttempt=0;setFeed(undefined);setPhase('idle');}else void check();};
  const offline=()=>{cancel();lastAttempt=0;setFeed(undefined);setPhase('idle');};
  const timer=window.setInterval(()=>void check(),60_000);
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('focus',visibility);window.addEventListener('offline',offline);window.addEventListener('online',visibility);
  void check();
  return()=>{active=false;cancel();window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('offline',offline);window.removeEventListener('online',visibility);};
 },[online,refreshKey]);
 // The local priority pass runs only when the loaded directory or relevant calendar day changes.
 const localResult=useMemo(()=>buildLocalTerritoryAlerts(agencies,clock),[agencies,utc,local]);
 const publicResult=useMemo(()=>online&&phase==='ready'?buildPublicTerritoryAlerts(feed,clock):{status:'unavailable' as const,alerts:[],feed:undefined},[feed,phase,online,clock]);
 const alerts=useMemo(()=>combineTerritoryAlerts(localResult.alerts,publicResult.alerts),[localResult,publicResult]);
 const feedStatus=!online?'offline':phase==='loading'?'loading':phase==='idle'?'unchecked':phase==='unavailable'?'unavailable':publicResult.status;
 return {local:localResult,public:publicResult,alerts,feedStatus,refresh:()=>setRefreshKey(n=>n+1)};
}
export type TerritoryAlertState=ReturnType<typeof useTerritoryAlerts>;
