#!/usr/bin/env node
import {createHash} from 'node:crypto';
let raw='';for await(const part of process.stdin)raw+=part;
const input=JSON.parse(raw);
const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>[key,canonical(value)])):v;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
let bindings;
if(input.profile==='grid')bindings=[...new Set(input.records.map(row=>digest(row.payload)))].sort();
else{
 bindings={};
 for(const row of input.records){
  if(Object.hasOwn(bindings,row.key))throw Error('Duplicate retained primary key');
  bindings[row.key]={proof:digest(row.payload),national:digest(row.nationalRow)};
 }
}
process.stdout.write(JSON.stringify({schemaVersion:1,...(input.profile==='grid'?{profile:input.method}:{method:input.method}),
 sourceArchiveSha256:input.sourceArchiveSha256,candidateCount:input.records.length,bindings})+'\n');
