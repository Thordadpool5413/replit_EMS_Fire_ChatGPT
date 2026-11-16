import {readFile,readdir,stat}from'node:fs/promises';import path from'node:path';
const root=path.resolve(process.argv[2]??'artifacts/ems-territory-intelligence/dist/public');
const assets=path.join(root,'assets');const files=(await readdir(assets)).filter(name=>name.endsWith('.js'));let imports=0;
for(const file of files){const text=await readFile(path.join(assets,file),'utf8');const pattern=/(?:\bfrom\s*|\bimport\s*\()(["'])(\.\.?\/[^"']+)\1/g;for(const match of text.matchAll(pattern)){const target=path.resolve(assets,match[2].split('?')[0]);if(!target.startsWith(root+path.sep))throw Error(`Module escapes build root: ${file}`);await stat(target).catch(()=>{throw Error(`Missing module ${match[2]} referenced by ${file}`);});imports++;}}
const worker=await readFile(path.join(root,'sw.js'),'utf8');
const boot=JSON.parse(worker.match(/const BOOT_ASSETS = (\[[^;]+\]);/)?.[1]??'[]');
for(const prefix of ['HomeHubView-','NationalGeographicExplorer-','PredictiveLeadQueue-'])if(!boot.some(name=>name.includes(prefix)))throw Error(`Core view absent from boot cache: ${prefix}`);
for(const file of boot)await stat(path.join(root,file));
console.log(`PASS: ${files.length} JavaScript bundles, ${imports} relative imports, ${boot.length} boot files; home, directory and agencies included.`);
