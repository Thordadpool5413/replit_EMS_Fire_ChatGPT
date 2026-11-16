/** Match transport/loading failures only; ordinary render errors need a different recovery. */
export function isModuleLoadError(error:unknown):boolean {
 const message=error instanceof Error?error.message:String(error??'');
 return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (?:css )?chunk [\w-]+ failed|unable to preload css/i.test(message);
}
/** Refresh the document after an explicit user action. Never clear application storage. */
export async function reloadApplication(environment:{online:boolean;updateWorker:()=>Promise<unknown>;reload:()=>void}):Promise<boolean>{
 if(!environment.online)return false;
 // A failed or hanging update check must not prevent a document reload.
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {await Promise.race([environment.updateWorker().catch(()=>undefined),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}
 finally {if(timer!==undefined)clearTimeout(timer);}
 environment.reload();return true;
}
