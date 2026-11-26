#!/usr/bin/env python3
"""Write small review summaries from already replayed retained source profiles."""
import collections,json,zipfile
from backfill_provider_locations import ROOT,sha,digest_file
from recover_nppes_native_primary import dump

def summarize(name):
 directory=ROOT/'scripts/data/evidence'/name/'2026-11-26'
 if not(directory/'manifest.json').exists():return
 manifest=json.loads((directory/'manifest.json').read_bytes())
 if digest_file(directory/'original.zip')!=manifest['archiveSha256']:raise ValueError('Cannot summarize changed source evidence')
 with zipfile.ZipFile(directory/'original.zip')as z:
  if'report.json'not in z.namelist():return
  raw=z.read('report.json')
 pin=manifest.get('reportSha256')or manifest.get('members',{}).get('report.json')
 if isinstance(pin,dict):pin=pin['sha256']
 if sha(raw)!=pin:raise ValueError('Cannot summarize a changed retained report')
 report=json.loads(raw);candidates=report.get('candidates',[]);diagnostics=report.get('diagnosticCandidates',[])
 summary={'schemaVersion':1,'source':report.get('source'),'method':report.get('method'),
  'originalPrimaryCount':46791,'candidateCount':len(candidates),'diagnosticCandidateCount':len(diagnostics),
  'archiveSha256':manifest['archiveSha256'],'reportSha256':sha(raw),'outcomes':report.get('outcomes',{}),
  'candidateMethods':dict(sorted(collections.Counter(c['match']['method']for c in candidates).items())),
  'diagnosticScopes':dict(sorted(collections.Counter(c.get('scope','native-component')for c in diagnostics).items())),
  'candidates':[{'key':c['key'],'method':c['match']['method'],'countyFips':c['countyFips']}for c in candidates],
  'rejectionCounts':dict(sorted(collections.Counter(r.get('reason')or','.join(r.get('reasons',[]))for r in report.get('rejected',[])).items())),
  'sourceInventorySha256':report.get('sourceInventorySha256'),'nativeTargetsSha256':report.get('nativeTargetsSha256'),
  'publication':'source candidates only; these counts do not establish combined coverage'}
 (directory/'summary.json').write_bytes(dump(summary));print(name,len(candidates),'original candidates',len(diagnostics),'diagnostic candidates')
def main():
 for name in('primary-nppes-components','primary-federal-city-fallback','primary-tiger-native'):summarize(name)
if __name__=='__main__':main()
