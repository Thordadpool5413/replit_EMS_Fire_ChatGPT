import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin} from 'vite';

/** New UI bundles must produce a new worker, so installed clients can offer an update. */
export function pwaRevision(): Plugin {
  return {
    name: 'ems-pwa-build-revision',
    apply: 'build',
    async writeBundle(options,bundle) {
      if(!options.dir) throw new Error('PWA revision requires a build output directory.');
      const workerPath=path.join(options.dir,'sw.js');
      const worker=await readFile(workerPath,'utf8');
      const boot=new Set<string>();
      const include=(fileName:string)=>{
        if(boot.has(fileName))return;
        boot.add(fileName);
        const chunk=bundle[fileName];
        if(chunk?.type==='chunk')chunk.imports.forEach(include);
      };
      for(const item of Object.values(bundle)){
        if(item.type==='chunk'&&(item.isEntry||item.facadeModuleId?.endsWith('/HomeHubView.tsx')))include(item.fileName);
        if(item.type==='asset'&&/\.(css|woff2)$/.test(item.fileName))boot.add(item.fileName);
      }
      const hash=createHash('sha256').update(worker).update(Object.keys(bundle).sort().join('\n'));
      for(const file of ['index.html','manifest.webmanifest','pwa-180.png','pwa-192.png','pwa-512.png','pwa-512-maskable.png','logo.jpg']){
        hash.update(await readFile(path.join(options.dir,file)));
      }
      const revision=hash.digest('hex').slice(0,16);
      const stamped=worker.replace('ems-territory-shell-v4',`ems-territory-shell-v4-${revision}`)
        .replace('/* BUILD_BOOT_ASSETS */ []',JSON.stringify([...boot].sort()));
      if(stamped===worker)throw new Error('PWA shell revision marker was not found.');
      await writeFile(workerPath,stamped);
    },
  };
}
