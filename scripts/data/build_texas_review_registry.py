#!/usr/bin/env python3
"""Build a review-only Texas organization catalog from pinned successful source artifacts."""
import argparse,collections,datetime,json,pathlib,re,shutil,zipfile
from backfill_provider_locations import PUBLIC,ROOT,read_registry,native_key,name_key,zip5,sha
from compile_review_coordinates import read_archive
DAY='2026-11-26'
EVIDENCE=ROOT/'scripts/data/evidence/texas-rosters'/DAY
DEST=PUBLIC/'state-ems-review'
PREFIX='https://www.dshs.texas.gov/sites/default/files/CP-EMSTraumaSystems/compliance/docs/'
REFERENCE='https://www.dshs.texas.gov/dshs-ems-trauma-systems/open-records-requests'
SOURCES={
 'provider':{'artifactId':15077494754,'artifactSha256':'ddbbd81edd8ac27e32b97636eb17c20d2d1226d3d678bd17757b1085d7d21e3a','member':'TX-candidate.json','sourceSha256':'899f074e9a0722215bf80206abe7b03e68b745c9b2756bac58c1a4597d31839b','sourceUrl':PREFIX+'emsproviderroster.xlsx','identifierKind':'license','licenseType':'Emergency Medical Service Provider','count':743,'conflicts':1},
 'first-responder':{'artifactId':15078672658,'artifactSha256':'bdcd37846c05f2be7e9aa0958af01accee2c531898af077126a6384c036e68f2','member':'TX-first-responder-candidate.json','sourceSha256':'bcc2f4c75da9c7904fcc696e41ff33f9bb6b5111421307eb8da1bbd6a05e6187','sourceUrl':PREFIX+'emsfirstresponderroster.xlsx','identifierKind':'registration','licenseType':'First Responder Organization','count':643,'conflicts':0}}
TEXT_FIELDS={'name','dbaName','licenseType','licenseRankAsReported','status','secondaryStatus','addressAsReported','mailingAddress2','city','state','zip','mailingCounty'}
DATE_FIELDS={'issuedOn','expiresOn','rankDateAsReported'}
FIELDS=TEXT_FIELDS|DATE_FIELDS|{'identifier','stationCountAsReported','licenseDateConflict','endUserValidationRequired'}
def valid_text(v):return v is None or isinstance(v,str) and 0<len(v)<=300 and v==v.strip() and not re.search(r'[\x00-\x1f\x7f]',v)
def valid_date(v):
    if v is None:return True
    try:return isinstance(v,str) and datetime.date.fromisoformat(v).isoformat()==v
    except ValueError:return False
def validate(kind,a):
    s=SOURCES[kind]
    expected={'schemaVersion':1,'jurisdiction':'TX','sourceName':'Texas Department of State Health Services','sourceUrl':s['sourceUrl'],'rosterKind':kind,'identifierKind':s['identifierKind'],'referenceUrl':REFERENCE,'retrievedAt':DAY,'sourceDate':None,'sourceSha256':s['sourceSha256'],'identifierColumn':'license number','nameColumn':'primary name','addressColumn':'mailing address 1','addressPurpose':'mailing-only','licenseDateConflictCount':s['conflicts']}
    if any(a.get(k)!=v for k,v in expected.items()):raise ValueError('Unexpected roster metadata: '+kind)
    rows=a.get('records')
    if not isinstance(rows,list) or len(rows)!=s['count']:raise ValueError('Unexpected roster count')
    ids=set();conflicts=0
    for row in rows:
        if set(row)!=FIELDS or not isinstance(row['identifier'],str) or not re.fullmatch(r'\d{6,7}',row['identifier']) or row['identifier'] in ids:raise ValueError('Unexpected native ID or row fields')
        ids.add(row['identifier'])
        if any(not valid_text(row[k]) for k in TEXT_FIELDS) or any(not valid_date(row[k]) for k in DATE_FIELDS):raise ValueError('Invalid source text/date')
        if not row['name'] or row['licenseType']!=s['licenseType'] or row['status']!='Current' or not re.fullmatch(r'[A-Z]{2}',row['state'] or '') or not zip5(row['zip']):raise ValueError('Unexpected source record classification')
        n=row['stationCountAsReported'];conflict=bool(row['issuedOn'] and row['expiresOn'] and row['expiresOn']<row['issuedOn'])
        if type(n) is not int or not 0<=n<=99999 or row['licenseDateConflict'] is not conflict or row['endUserValidationRequired'] is not True:raise ValueError('Invalid source evidence flags')
        conflicts+=conflict
    if conflicts!=s['conflicts']:raise ValueError('Date conflict count mismatch')
    return rows
def candidate_index(national):
    out=collections.defaultdict(list)
    for r in national:
        key=native_key(r)
        if not key or r[3]!='TX' or r[9] or not r[4] or not zip5(r[5]):continue
        out[(name_key(r[2]),name_key(r[4]),zip5(r[5]))].append((key,r))
    return out
def reconcile(row,index):
    # Mailing geography is only a corroboration clue, not a physical address, and
    # no fuzzy match, name-only match, county claim, or identity assignment is made.
    if row['state']!='TX' or not row['city'] or not zip5(row['zip']):return []
    hits={}
    for field,basis in (('name','primary-name'),('dbaName','dba-name')):
        name=row.get(field)
        if not name:continue
        for key,r in index.get((name_key(name),name_key(row['city']),zip5(row['zip'])),[]):
            entry=hits.setdefault(key,{'sourceKey':key,'name':r[2],'source':r[1],'city':r[4],'postalCode':r[5],'basis':[]})
            entry['basis'].append(basis)
    return [hits[k] for k in sorted(hits)]
def build(archives,national,national_hash):
    index=candidate_index(national);records=[];sources={};stats=collections.Counter()
    for kind,s in SOURCES.items():
        a=read_archive(archives/(kind+'.zip'),s['artifactSha256'],s['member'])
        with zipfile.ZipFile(archives/(kind+'.zip')) as z:
            if sorted(z.namelist())!=sorted([s['member'],'schema-review.json']):raise ValueError('Unexpected artifact members')
            review=json.loads(z.read('schema-review.json'))
            if review.get('sha256')!=s['sourceSha256']:raise ValueError('Workbook hash mismatch')
        rows=validate(kind,a)
        sources[kind]={k:s[k] for k in ('artifactId','artifactSha256','sourceSha256','sourceUrl','identifierKind','count','conflicts')}
        for row in rows:
            hits=reconcile(row,index);stats['singleCandidate' if len(hits)==1 else 'multipleCandidates' if hits else 'noCandidate']+=1
            stats['outsideTexasMailing']+=row['state']!='TX'
            records.append({**row,'rosterKind':kind,'sourceKey':'TX-DSHS:'+s['identifierKind']+':'+row['identifier'],'nationalReviewCandidates':hits})
    keys={r['sourceKey'] for r in records}
    if len(keys)!=1386 or len(records)!=1386:raise ValueError('Texas registry count mismatch')
    return {'schemaVersion':1,'publication':'review-only','jurisdiction':'TX','retrievedAt':DAY,'referenceUrl':REFERENCE,'nationalRegistrySha256':national_hash,'sources':sources,'counts':dict(stats),'records':sorted(records,key=lambda r:r['sourceKey'])}
def serialize(a):return (json.dumps(a,ensure_ascii=True,sort_keys=True,separators=(',',':'))+'\n').encode()
def outputs(archives):
    _,national=read_registry();national_hash=sha((PUBLIC/'national/index.json').read_bytes());catalog=build(archives,national,national_hash)
    data=serialize(catalog);index=serialize({'schemaVersion':1,'publication':'review-only','file':'TX-review.json','sha256':sha(data),'count':len(catalog['records']),'retrievedAt':DAY})
    return catalog,{'TX-review.json':data,'TX-index.json':index}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archives',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archives)==a.verify:raise ValueError('Choose stage or verify')
    catalog,files=outputs(EVIDENCE if a.verify else a.archives)
    if a.verify:
        for k,v in files.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Published review catalog differs from verified inputs: '+k)
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=True)
        for kind in SOURCES:shutil.copyfile(a.archives/(kind+'.zip'),EVIDENCE/(kind+'.zip'))
        for k,v in files.items():(DEST/k).write_bytes(v)
    print('Texas review registry:',json.dumps({'records':len(catalog['records']),'counts':catalog['counts'],'publication':catalog['publication'],'newMapped':0}))
if __name__=='__main__':main()
