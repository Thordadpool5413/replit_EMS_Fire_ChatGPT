#!/usr/bin/env python3
"""Read-only explanation of withheld native range decisions; no selector changes."""
import collections,gzip,json,pathlib,zipfile
from backfill_provider_locations import ROOT,sha
from stage_tiger_primary import dump
from retain_tiger_primary import validated_catalog
from checkpoint_tiger_source import EVIDENCE as SOURCE_CACHE
from match_tiger_primary import range_disagreement

OUTPUT=ROOT/'scripts/data/evidence/primary-tiger-native/2026-11-26/exclusion-audit.json'
PARSER_GUARDS={'unsupported-native-house-range','nonpositive-native-house-range','native-range-parity-disagreement',
               'unsupported-native-parity','unsupported-native-range-flag',
               'unsupported-native-multipart-geometry','invalid-native-polyline','invalid-native-polyline-coordinate',
               'zero-length-native-geometry','unsupported-antimeridian-segment'}

def audit():
 report,inputs,manifest=validated_catalog();originals={r['entry']['key']:r['entry']for r in inputs['targets']if r['scope']=='original'}
 rejected=[r for r in report['rejected']if r['scope']=='original'];counts=collections.Counter();otherwise=collections.defaultdict(list)
 examples=collections.defaultdict(list);needed=set();chosen={}
 for row in rejected:
  for reason in row['reasons']:counts[reason]+=1
  points=row['eligibleNativeRanges'];source_county=originals[row['key']]['sourceCounty']
  consistent=bool(points)and not range_disagreement(points)and(not source_county or all(p['point']['countyFips']==source_county for p in points))
  if consistent:
   for reason in row['reasons']:otherwise[reason].append(row['key'])
  for reason in row['reasons']:
   if len(examples[reason])>=3:continue
   witness=next((v for v in row['nativeConflicts']if v['reason']==reason and v.get('nativeRange')),None)
   if witness:
    native=witness['nativeRange'];reference=(native['countyFips'],native['sourceRowNumber']);needed.add(reference)
   else:reference=None
   example={'key':row['key'],'targetAddress':row['address'],'reasons':row['reasons'],
            'otherwiseConsistentQualifiedRangeCount':len(points)if consistent else 0,
            'nativeConflict':witness or next((v for v in row['nativeConflicts']if v['reason']==reason),None),
            'qualifiedRangeIds':[p['point']['nativeId']for p in points],'reference':list(reference)if reference else None}
   examples[reason].append(example)
 source_manifest=json.loads((SOURCE_CACHE/'manifest.json').read_bytes());flags=collections.defaultdict(collections.Counter);native_bounds=collections.Counter()
 for pack in source_manifest['sourceArchives']:
  with zipfile.ZipFile(SOURCE_CACHE/pack['file'])as z:
   for name in z.namelist():
    document=json.loads(gzip.decompress(z.read(name)))
    for record in document['records']:
     attributes=record['native']['attributes']
     for side in('L','R'):
      for field in(side+'FROMTYP',side+'TOTYP','OFFSET'+side,'PARITY'+side):flags[field][str(attributes.get(field,''))]+=1
      first=str(attributes.get(side+'FROMHN')or'');last=str(attributes.get(side+'TOHN')or'')
      if first or last:native_bounds['both-pure-numeric'if first.isdigit()and last.isdigit()else'one-or-more-nonnumeric-or-missing']+=1
     reference=(document['countyFips'],record['sourceRowNumber'])
     if reference in needed:
      chosen[reference]={'sourceFile':document['sourceFile'],'sourceArchiveSha256':document['sourceArchiveSha256'],
       'sourceRowNumber':record['sourceRowNumber'],'nativeRecordSha256':record['nativeRecordSha256'],
       'attributes':attributes,'geometry':{'shapeType':record['native']['geometry']['shapeType'],
        'parts':record['native']['geometry']['parts'],'vertexCount':len(record['native']['geometry']['points']),
        'first':record['native']['geometry']['points'][0]if record['native']['geometry']['points']else None,
        'last':record['native']['geometry']['points'][-1]if record['native']['geometry']['points']else None}}
 for values in examples.values():
  for example in values:
   reference=example.pop('reference')
   if reference:example['retainedNativeRecord']=chosen[tuple(reference)]
 parser_only=[r['key']for r in rejected if set(r['reasons'])<=PARSER_GUARDS and r['eligibleNativeRanges']and not range_disagreement(r['eligibleNativeRanges'])]
 summary={'schemaVersion':1,'publication':'read-only exclusion audit; no guard or candidate changed',
  'reportSha256':manifest['members']['report.json']['sha256'],'archiveSha256':manifest['archiveSha256'],
  'sourceCountyFileCount':3227,'sourceRows':23314306,'retainedNativeFeatures':report['retainedNativeFeatureCount'],
  'originalCandidates':len(report['candidates']),'originalRejectedTargets':len(rejected),
  'legacyWithheldKeysAudited':len(report['legacyEligibility']['withheldKeys']),
  'targetCountsByRejectionReason':dict(sorted(counts.items())),
  'otherwiseConsistentQualifiedRangesByReason':{k:{'targetCount':len(v),'keys':v}for k,v in sorted(otherwise.items())},
  'parserGuardOnlyTargetsWithAnotherConsistentRange':parser_only,
  'nativeFlagsAcrossEveryRetainedFeature':{k:dict(sorted(v.items()))for k,v in sorted(flags.items())},
  'nativeBoundsAcrossEveryRetainedFeature':dict(native_bounds),'nativeExamples':dict(examples),
  'historicalComparison':{'previousReportedOriginalCount':986,'currentReplayedOriginalCount':len(report['candidates']),
   'exactPreviousCandidateMembershipAvailable':False,
   'interpretation':'The earlier candidate bytes are unavailable. These actual native reasons explain present exclusions; no exact lost-edition row comparison or attribution of every count difference is asserted.'}}
 OUTPUT.write_bytes(dump(summary));print(json.dumps({k:v for k,v in summary.items()if k not in('nativeExamples','otherwiseConsistentQualifiedRangesByReason','nativeFlagsAcrossEveryRetainedFeature')}),flush=True)
if __name__=='__main__':audit()
