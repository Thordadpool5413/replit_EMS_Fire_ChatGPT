import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('./package.json', import.meta.url));
const root = fileURLToPath(new URL('../artifacts/ems-territory-intelligence/', import.meta.url));
async function files(dir) {
  const entries=await readdir(dir,{withFileTypes:true});
  return (await Promise.all(entries.map(e=>e.isDirectory()?files(`${dir}/${e.name}`):/\.test\.tsx?$/.test(e.name)?[`${dir}/${e.name}`]:[]))).flat();
}
const result=spawnSync(process.execPath,['--import',require.resolve('tsx'),'--test',...(await files(root+'src')),fileURLToPath(new URL('../artifacts/api-server/src/lib/fireRegistry.test.ts',import.meta.url)),fileURLToPath(new URL('../artifacts/api-server/src/lib/publicIntelligenceDiscovery.test.ts',import.meta.url))],{cwd:root,stdio:'inherit'});
process.exitCode=result.status ?? 1;
