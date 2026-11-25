import type {RequestHandler} from 'express';

/** Liveness is independent; readiness verifies required schema without reading records.
 * Coalesce simultaneous probes. A timed-out check remains in flight until it settles.
 */
export function makeReadinessHandler(probe:()=>Promise<unknown>,timeoutMs=3000):RequestHandler{
 let pending:Promise<boolean>|undefined;
 function check(){
  if(!pending)pending=Promise.resolve().then(probe).then(()=>true,()=>false).finally(()=>{pending=undefined;});
  return pending;
 }
 return async(_req,res)=>{
  res.set('Cache-Control','no-store');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const ready=await Promise.race([check(),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
   res.status(ready?200:503).json({status:ready?'ready':'unavailable'});
  }finally{if(timer!==undefined)clearTimeout(timer);}
 };
}
