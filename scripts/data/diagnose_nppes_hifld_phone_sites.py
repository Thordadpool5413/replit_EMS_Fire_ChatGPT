#!/usr/bin/env python3
"""Read-only native CMS/HIFLD telephone and exact-name site yield assessment.

No location is published. Both complete retained HIFLD inventories, the complete
native Type 2 ambulance phone inventory, and the complete native Type 3 DBA
reference are audited. Historical source role/date uncertainty is explicit.
"""
import argparse,collections,copy,json,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,sha,digest_file,zip5,native_key
from address_normalization import physical_address,address_key,normalized_city
from recover_nppes_native_primary import active,dump
from recover_nppes_primary_components import inputs as cms_inputs
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE,verify as verify_cms,current_pins
from retain_nppes_other_names import EVIDENCE as DBA_EVIDENCE,source_catalog as dba_catalog,FIELDS
from recover_nppes_phone_identity import phone,possible_phones,agency_name,distinctive,ELIGIBLE
from retain_federal_primary_points import evidence_directory,verify as verify_federal,retained_files
from stage_usgs_primary import (attrs,source_address,valid_point,placement,coordinate_key,
 coordinate_address_signature,make_match,records,validate_inventory,distance_m,SOURCES,source_date)
from recover_neris_primary import load_boundaries
from build_neris_station_map import county_for

EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-hifld-phone-diagnostic/2026-11-26'
HIFLD=('hifld-ems','hifld-fire')
NAME_FIELD='NAME'
PHONE_FIELD='TELEPHONE'
POSITIVE_STATUSES={'','OPEN','IN SERVICE','ACTIVE','OPERATIONAL'}

def names_for(record,dba_rows,dba_sha):
 native=record['native'];result=[{'field':'legal-name','name':native['Provider Organization Name (Legal Business Name)']}]
 if native['Provider Other Organization Name Type Code']=='3'and native['Provider Other Organization Name'].strip():
  result.append({'field':'native-primary-dba-type-3','name':native['Provider Other Organization Name'],'typeCode':'3'})
 for row in dba_rows.get(record['npi'],[]):
  if row['native']['NPI']!=record['npi']:raise ValueError('Explicit native DBA moved across NPI identities')
  if row['native'][FIELDS[2]]=='3':
   result.append({'field':'native-reference-dba-type-3','name':row['native'][FIELDS[1]],'typeCode':'3',
     'nativeReferenceRow':copy.deepcopy(row),'referenceReportSha256':dba_sha})
 return result

def exact_name_witnesses(record,native_name,dba_rows,dba_sha):
 if not distinctive(native_name):return []
 return[copy.deepcopy(row)for row in names_for(record,dba_rows,dba_sha)
        if distinctive(row['name'])and agency_name(row['name'])==agency_name(native_name)]

def complete_hifld(source):
 evidence=evidence_directory(source);manifest=verify_federal(evidence)
 with tempfile.TemporaryDirectory(prefix='atlas-hifld-phone-')as td:
  directory=pathlib.Path(td)
  with zipfile.ZipFile(evidence/'original.zip')as z:
   inventory=json.loads(z.read('source/inventory.json'))
   for name in retained_files(directory,inventory):
    member='source/'+name
    if pathlib.PurePosixPath(member).is_absolute()or'..'in pathlib.PurePosixPath(member).parts:raise ValueError('Unsafe retained source member')
    z.extract(member,directory)
  base=directory/'source';validate_inventory(base,inventory)
  metadata=json.loads((base/'metadata.json').read_bytes());header=[r['name'].upper()for r in metadata['fields']]
  if not {NAME_FIELD,PHONE_FIELD,'ID','FIPS','GEOPREC','ADDRESS','CITY','STATE','ZIP'}<=set(header):
   raise ValueError('Unexpected retained HIFLD native telephone schema: '+source+' '+repr(header))
  rows=[{'source':source,'feature':copy.deepcopy(feature),'page':copy.deepcopy(page)}
        for feature,page in records(base,inventory)]
 if len(rows)!=inventory['sourceCount']:raise ValueError('Incomplete native HIFLD telephone source inventory')
 return rows,inventory,{'source':source,'rowsAudited':len(rows),'nativeFields':header,
  'sourceInventorySha256':inventory['sourceSha256'],'archiveSha256':manifest['archiveSha256'],
  'nativeStatusCounts':dict(sorted(collections.Counter(str(attrs(r['feature']).get('STATUS')or'')for r in rows).items())),
  'nativeContactDates':dict(sorted(collections.Counter(str(source_date(attrs(r['feature']).get('CONTDATE')))for r in rows).items()))}

def native_phone_owner(attributes):
 value=attributes.get('ID')
 if not isinstance(value,(int,str))or isinstance(value,bool)or not str(value).strip():return None
 return str(value).strip()

def dependencies():
 paths=[('native-cms',CMS_EVIDENCE),('native-dba-reference',DBA_EVIDENCE)]+[(s,evidence_directory(s))for s in HIFLD]
 return {name:{'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
         for name,path in paths}

def generate():
 verify_cms(CMS_EVIDENCE);snapshot,_,native=cms_inputs();other,other_manifest=dba_catalog()
 original={e['key']:e for e in snapshot['entries']};cms_records={r['key']:r for r in native['records']}
 dba_rows=collections.defaultdict(list)
 for row in other['selectedNativeRows']:dba_rows[row['native']['NPI']].append(row)
 cms_owners=collections.defaultdict(set);cms_malformed=set()
 for row in native['phoneInventory']:
  for value in possible_phones(row['telephone']):
   cms_owners[value].add(row['key'])
   if phone(row['telephone'])!=value:cms_malformed.add(value)
 source_rows={};inventories={};source_stats={};source_owners={s:collections.defaultdict(set)for s in HIFLD}
 by_phone={s:collections.defaultdict(list)for s in HIFLD};malformed=set();reuse=collections.defaultdict(set)
 for source in HIFLD:
  rows,inventory,stats=complete_hifld(source);source_rows[source]=rows;inventories[source]=inventory;source_stats[source]=stats
  for row in rows:
   a=attrs(row['feature']);raw=a.get(PHONE_FIELD);owner=native_phone_owner(a)
   for value in possible_phones(raw):
    source_owners[source][value].add(owner or'MISSING-NATIVE-ID:'+str(a['OBJECTID']))
    by_phone[source][value].append(row)
    if phone(raw)!=value:malformed.add(value)
   if valid_point(row['feature']):
    signature=coordinate_address_signature(source_address(row['feature'],source))
    if signature:reuse[coordinate_key(row['feature'])].add(signature)
 boundaries=load_boundaries();qualified=[];withheld=[];outcomes=collections.Counter();per_source=collections.Counter()
 for key,record in sorted(cms_records.items()):
  old=original[key]
  if old['status']not in ELIGIBLE:outcomes['original-status-ineligible']+=1;continue
  source_address_native=record['primaryAddress'];value=phone(record['telephone']);reason=None;issues=[];observations=[]
  if not active(record)or source_address_native['country']not in('','US'):reason='inactive-or-nondomestic-native-cms-record'
  elif not value:reason='invalid-native-primary-practice-phone'
  elif value in cms_malformed or value in malformed:reason='malformed-native-phone-collision'
  elif cms_owners[value]!={key}:reason='phone-not-unique-in-complete-ambulance-inventory'
  elif not any(by_phone[s].get(value)for s in HIFLD):reason='no-native-hifld-phone'
  else:
   for source in HIFLD:
    rows=by_phone[source].get(value,[])
    if not rows:continue
    if len(source_owners[source][value])!=1:
     issues.append({'source':source,'reason':'phone-not-unique-in-complete-native-source','nativeOwnerIds':sorted(source_owners[source][value])})
     continue
    source_observations=[]
    for row in rows:
     feature=row['feature'];a=attrs(feature);address=source_address(feature,source);name=a.get(NAME_FIELD)
     witness={'source':source,'objectId':a['OBJECTID'],'nativeId':a.get('ID'),'sourcePageSha256':row['page']['sha256'],
       'sourceInventorySha256':inventories[source]['sourceSha256'],'addressAsReported':copy.deepcopy(address),
       'nativeName':name,'nativePhone':a.get(PHONE_FIELD),'nativeStatus':a.get('STATUS'),
       'nativeContactDate':source_date(a.get('CONTDATE')),'nativeGeoDate':source_date(a.get('GEODATE'))}
     error=None;name_witnesses=[]
     if not native_phone_owner(a):error='missing-native-facility-id'
     elif phone(a.get(PHONE_FIELD))!=value:error='malformed-native-phone-collision'
     elif not isinstance(name,str):error='missing-native-complete-organization-name'
     elif(address['state']!=source_address_native['state']or
          normalized_city(address['city'])!=normalized_city(source_address_native['city'])or
          not address['zip']or address['zip']!=zip5(source_address_native['postalCode'])):
      error='native-phone-locality-disagreement'
     else:
      name_witnesses=exact_name_witnesses(record,name,dba_rows,other_manifest['reportSha256'])
      if not name_witnesses:error='native-complete-legal-or-explicit-dba-name-disagreement'
     if not error and str(a.get('STATUS')or'').strip().upper()not in POSITIVE_STATUSES:error='source-native-status-not-qualified'
     if not error and not physical_address(address):error='source-site-address-not-physical'
     if not error and(not valid_point(feature)or not placement(feature,source)):error='source-native-point-or-placement-not-qualified'
     if not error and len(reuse[coordinate_key(feature)])!=1:error='coordinate-reused-across-distinct-native-source-addresses'
     county=None
     if not error:
      geometry=feature['geometry'];county,_=county_for([geometry['y'],geometry['x']],boundaries[address['state']])
      if not county:error='native-point-county-unresolved'
      elif a['FIPS']!=county:error='native-source-county-disagreement'
      elif old['sourceCounty']and old['sourceCounty']!=county:error='original-source-county-disagreement'
     if error:
      issues.append({**witness,'reason':error});continue
     match=make_match(feature,row['page'],inventories[source],county)
     source_observations.append({**witness,'nameWitnesses':name_witnesses,'match':match,
      'nativeFeature':copy.deepcopy(feature),'sourcePage':copy.deepcopy(row['page']),
      'nativeFeatureSha256':sha(dump(feature))})
    if source_observations:
     per_source[source]+=1;observations.extend(source_observations)
   if issues:reason='native-phone-owner-or-site-conflict'
   elif len({address_key(o['match']['sourceAddress'])for o in observations})!=1:
    reason='native-phone-owner-has-distinct-site-addresses'
   elif len({o['match']['point']['countyFips']for o in observations})!=1 or any(
    distance_m(a['match'],b['match'])>75 for i,a in enumerate(observations)for b in observations[i+1:]):
    reason='native-phone-site-coordinate-disagreement'
   elif not observations:reason='no-qualified-native-site-point'
  if reason:
   outcomes[reason]+=1
   if issues or observations:withheld.append({'key':key,'originalAddress':copy.deepcopy(old['address']),
      'reason':reason,'nativeIssues':issues,'qualifiedNativeObservations':observations})
   continue
  outcomes['qualified-historical-native-phone-site-correlation']+=1
  qualified.append({'key':key,'name':old['name'],'source':old['source'],'state':old['state'],
   'sourceCounty':old['sourceCounty'],'sourceDate':old['sourceDate'],'originalAddress':copy.deepcopy(old['address']),
   'originalStatus':old['status'],'nativePhone':value,'cmsNativeRecord':copy.deepcopy(record),
   'nameRule':'complete-native-legal-name-or-explicit-type3-dba','localityRule':'exact-native-city-state-zip',
   'completePhoneInventoryScope':native['phoneInventoryScope'],
   'sourceObservations':observations,'sourceCount':len({o['source']for o in observations}),
   'association':'inferred','diagnosticOnly':True,
   'siteRole':'historical-hifld-facility-associated-with-current-native-primary-phone',
   'sourceRoleLimitation':'Historical HIFLD facility/contact evidence does not establish current primary headquarters or current occupancy. No primary-site proof or mapping eligibility is enabled by this diagnostic.'})
 return {'schemaVersion':1,'source':'native-cms-hifld-exact-phone-name-locality-diagnostic',
  'originalPrimaryCount':46791,'baselineIndexSha256':snapshot['baselineIndexSha256'],
  'nationalRegistrySha256':snapshot['nationalRegistrySha256'],'nativeCmsReportSha256':current_pins()[0],
  'nativeDbaReportSha256':other_manifest['reportSha256'],'completeCmsMonthlyRows':native['scanReceipt']['rowsScanned'],
  'completeCmsAmbulanceOrganizations':len(native['phoneInventory']),'completeCmsPhoneInventoryScope':native['phoneInventoryScope'],
  'nativeHifldInventories':source_stats,'qualifiedSiteGroups':qualified,'withheld':withheld,
  'outcomes':dict(sorted(outcomes.items())),'perSourceGroupsBeforeCrossSourceGuards':dict(sorted(per_source.items())),
  'sourceDependencies':dependencies(),'publication':'diagnostic only; neither primary address eligibility nor coverage is changed'}

def summary(report):
 groups=report['qualifiedSiteGroups'];contacts=collections.Counter();geodates=collections.Counter();source_counts=collections.Counter();fields=collections.Counter()
 for group in groups:
  for row in group['sourceObservations']:
   source_counts[row['source']]+=1;contacts[str(row['nativeContactDate'])]+=1;geodates[str(row['nativeGeoDate'])]+=1
   fields.update({w['field']for w in row['nameWitnesses']})
 return {'schemaVersion':1,'qualifiedHistoricalSiteGroups':len(groups),'originalPrimaryCount':46791,
  'cmsPhoneInventoryCount':report['completeCmsAmbulanceOrganizations'],'cmsPhoneInventoryScope':report['completeCmsPhoneInventoryScope'],
  'nativeHifldInventories':{s:{k:v for k,v in r.items()if k not in('nativeFields','nativeContactDates')}for s,r in report['nativeHifldInventories'].items()},
  'outcomes':report['outcomes'],'perSourceGroupsBeforeCrossSourceGuards':report['perSourceGroupsBeforeCrossSourceGuards'],
  'acceptedNativeObservationsBySource':dict(sorted(source_counts.items())),
  'acceptedNativeContactDates':dict(sorted(contacts.items())),'acceptedNativeGeoDates':dict(sorted(geodates.items())),
  'acceptedNameFields':dict(sorted(fields.items())),
  'groups':[{'key':g['key'],'name':g['name'],'sources':sorted({o['source']for o in g['sourceObservations']}),
    'addresses':[o['match']['sourceAddress']for o in g['sourceObservations']],
    'precisions':sorted({o['match']['point']['precision']for o in g['sourceObservations']}),
    'contactDates':sorted({str(o['nativeContactDate'])for o in g['sourceObservations']})}for g in groups],
  'finalNonphoneCoverageComparison':'pending exact retained final non-phone release',
  'publication':report['publication']}

def retain(output=EVIDENCE):
 report=generate();raw=dump(report);output.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  info=zipfile.ZipInfo('report.json',date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 manifest={'schemaVersion':1,'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
  'reportSha256':sha(raw),'qualifiedHistoricalSiteGroups':len(report['qualifiedSiteGroups']),'sourceDependencies':dependencies()}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report)))
 return report,manifest

def verify(output=EVIDENCE):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if(manifest['sourceDependencies']!=dependencies()or digest_file(output/'original.zip')!=manifest['archiveSha256']or
    (output/'original.zip').stat().st_size!=manifest['archiveBytes']):raise ValueError('Native HIFLD phone diagnostic dependency changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if z.namelist()!=['report.json']:raise ValueError('Native HIFLD phone diagnostic membership changed')
  raw=z.read('report.json')
 report=generate()
 if sha(raw)!=manifest['reportSha256']or raw!=dump(report)or len(report['qualifiedSiteGroups'])!=manifest['qualifiedHistoricalSiteGroups']:
  raise ValueError('Complete native HIFLD phone diagnostic replay changed')
 if(output/'summary.json').read_bytes()!=dump(summary(report)):raise ValueError('Native HIFLD phone diagnostic summary changed')
 return report,manifest

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--verify',action='store_true');a=p.parse_args()
 report,manifest=verify(a.output)if a.verify else retain(a.output)
 print(json.dumps({'qualifiedHistoricalSiteGroups':len(report['qualifiedSiteGroups']),'outcomes':report['outcomes'],
  'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256'],'publication':report['publication']}),flush=True)
if __name__=='__main__':main()
