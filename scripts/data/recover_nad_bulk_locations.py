#!/usr/bin/env python3
"""One streaming scan of the USDOT September 2026 NAD release, with only exact registry-address joins.
No remote address queries, no nationwide address extraction, no unrelated rows retained.
"""
import argparse,collections,csv,io,json,math,pathlib,re,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,base_street,normal_street,physical,read_registry,publish,verify,digest_file,zip5
from recover_nad_locations import county_index,resolve_point
DOWNLOAD='https://data.transportation.gov/api/views/fc2s-wawr/files/596a301b-d548-4589-8c63-6b6a8dc34f30?download=true&filename=TXT.zip'
CATALOG='https://data.transportation.gov/d/fc2s-wawr'
RELEASE='2026-09-30'
FIELDS=('OID_','AddNo_Full','StNam_Full','State','Zip_Code','Post_City','Inc_Muni','County','Placement','AddrClass','Lifecycle','NAD_Source','AddAuth','Latitude','Longitude')
def target_key(a):
 if not physical(a):return None
 return (a['state'],a['zip'],normal_street(base_street(a['street'])))
def scan(archive,entries,counties,states=STATES,minimum_member_bytes=1_000_000):
 """Fail closed for incomplete archive or changed schema. All candidates must be seen before committing any matches."""
 grouped=collections.defaultdict(list);stats=collections.Counter()
 for e in entries:
  if e['state'] not in states or e['status'] not in ('no-match','unavailable'):continue
  k=target_key(e['address'])
  if k is None:stats['unsupported_format']+=1;continue
  grouped[k].append(e)
 # Filter early by state/ZIP before normalizing full streets. Only target-sized candidate buckets retained.
 scopes=collections.defaultdict(set)
 for state,zip_,street in grouped:scopes[(state,zip_)].add(street)
 hits=collections.defaultdict(list);seen=collections.defaultdict(set);overflow=set();row_count=0
 with zipfile.ZipFile(archive) as z:
  candidates=[f for f in z.infolist() if not f.is_dir() and pathlib.PurePosixPath(f.filename).suffix.lower() in ('.txt','.csv') and f.file_size>=minimum_member_bytes]
  # The published TXT release has one address data member. Refuse unknown splits instead of skipping rows.
  if len(candidates)!=1:raise ValueError('Expected one NAD address table in ZIP')
  member=candidates[0]
  if member.file_size>70_000_000_000 or member.flag_bits&1:raise ValueError('Archive exceeds bounded scan or is encrypted')
  with z.open(member) as raw,io.TextIOWrapper(raw,encoding='utf-8-sig',newline='') as stream:
   first=stream.readline(65536)
   formats=[]
   for d in (',','\t','|'):
    try:formats.append((d,next(csv.reader([first],delimiter=d,strict=True))))
    except csv.Error:continue
   valid=[(d,h) for d,h in formats if set(FIELDS)<=set(h) and len(set(h))==len(h)]
   if len(valid)!=1:raise ValueError('NAD table header differs from official schema')
   delimiter,header=valid[0];col={f:header.index(f) for f in FIELDS}
   csv.field_size_limit(1_000_000)
   for row in csv.reader(stream,delimiter=delimiter,strict=True):
    row_count+=1
    if len(row)!=len(header):raise ValueError('NAD malformed row at '+str(row_count))
    if row_count%5_000_000==0:print('NAD scanned rows',row_count,'target address buckets',len(hits),flush=True)
    state=row[col['State']];postal=row[col['Zip_Code']]
    if (state,postal) not in scopes:continue
    street=normal_street(row[col['AddNo_Full']]+' '+row[col['StNam_Full']])
    if street not in scopes[(state,postal)]:continue
    k=(state,postal,street)
    if k in overflow:continue
    record={f:row[i] for f,i in col.items()}
    # The text export stores coordinates and the source object ID as text.
    oid=record.pop('OID_')
    if not re.fullmatch(r'[1-9]\d{0,11}',oid):raise ValueError('Invalid candidate OID')
    oid=int(oid)
    if oid in seen[k]:raise ValueError('Repeated source OID for target address')
    seen[k].add(oid)
    try:x=float(record.pop('Longitude'));y=float(record.pop('Latitude'))
    except ValueError:x=y=float('nan')
    record['OBJECTID']=oid
    if len(hits[k])>=250:
     overflow.add(k);hits.pop(k,None);seen.pop(k,None);continue
    hits[k].append(dict(attributes=record,geometry=dict(x=x,y=y)))
  # Read the full member to EOF; zipfile CRC is checked on stream completion.
 for k,group in grouped.items():
  for e in group:
   if k in overflow:stats['ambiguous']+=1;continue
   found,status=resolve_point(e['address'],hits.get(k,[]),counties,e['sourceCounty']);stats[status]+=1
   if found:
    point,county=found
    point['point']['dataset']='bulk-r24'
    e.update(status='mapped',match=point,countyFips=county)
 return dict(stats,rowsScanned=row_count,targetAddresses=len(grouped),candidateAddresses=len(hits),overflowAddresses=len(overflow))
def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--states',default='all');args=p.parse_args()
 states=STATES if args.states=='all' else set(args.states.split(','))
 if not states or not states<=STATES:raise ValueError('Invalid state scope')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 idx=json.loads((args.output/'index.json').read_bytes());entries=[e for c in idx['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 old={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 stats=scan(args.archive,entries,counties,states)
 if stats['rowsScanned']<90_000_000:raise ValueError('Bulk table incomplete or wrong release; no output published')
 if any(json.dumps(e,sort_keys=True)!=old[e['key']] for e in entries if e['key'] in old):raise ValueError('Prior mapping changed')
 print('NAD bulk summary',json.dumps(stats),flush=True)
 if not stats.get('mapped'):raise ValueError('No additional validated bulk points')
 metadata={k:v for k,v in idx.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','nadBulkRecovery')}
 metadata['nadBulkRecovery']=dict(sourceUrl=DOWNLOAD,catalogUrl=CATALOG,release=RELEASE,sha256=digest_file(args.archive),scope=sorted(states),results=stats,previousMapped=len(old),newMapped=stats['mapped'])
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
