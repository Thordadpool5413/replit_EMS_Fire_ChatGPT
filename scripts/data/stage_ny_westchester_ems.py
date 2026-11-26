#!/usr/bin/env python3
"""Acquire WREMSCO organization-only listings and compare exact national registry evidence."""
import argparse,collections,datetime,hashlib,json,pathlib,re
from html.parser import HTMLParser
from urllib.request import Request,build_opener,HTTPRedirectHandler
from backfill_provider_locations import PUBLIC,read_registry,native_key,name_key,zip5,sha
SOURCE='https://wremsco.org/WREMSCOAgencies/'
AUTHORITY='https://www.health.ny.gov/professionals/ems/charta.htm'
HEADER=('Agency Name','Agency Non Emergency Phone','Headquarters Street','Agency City','Agency State','Agency Zipcode','Agency Website','Primary Contact Name','Primary Contact Title','Secondary Contact Name','Secondary Contact Title','Agency Code')
MAX_BYTES=4000000
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def norm(v):return ' '.join(v.split())
class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.stack=[];self.tables=[]
    def handle_starttag(self,tag,attrs):
        if tag=='table':
            if len(self.stack)>8:raise ValueError('Unexpected nested table depth')
            self.stack.append({'rows':[],'row':None,'cell':None,'nested':False})
        if not self.stack:return
        t=self.stack[-1]
        if tag=='tr':
            if t['row'] is not None:raise ValueError('Unclosed table row')
            t['row']=[]
        elif tag in ('th','td'):
            if t['row'] is None or t['cell'] is not None:raise ValueError('Unexpected cell structure')
            if any(k in ('rowspan','colspan') and v not in ('1',None) for k,v in attrs):t['nested']=True
            t['cell']=[]
        elif tag=='br' and t['cell'] is not None:t['cell'].append(' ')
    def handle_data(self,data):
        if self.stack and self.stack[-1]['cell'] is not None:self.stack[-1]['cell'].append(data)
    def handle_endtag(self,tag):
        if not self.stack:return
        t=self.stack[-1]
        if tag in ('td','th'):
            if t['cell'] is None or t['row'] is None:raise ValueError('Malformed table cell')
            t['row'].append(norm(''.join(t['cell'])));t['cell']=None
        elif tag=='tr':
            if t['row'] is None or t['cell'] is not None:raise ValueError('Malformed table row')
            t['rows'].append(t['row']);t['row']=None
        elif tag=='table':
            if t['row'] is not None or t['cell'] is not None:raise ValueError('Malformed table ending')
            self.tables.append(self.stack.pop())
            if self.stack:self.stack[-1]['nested']=True
def parse(html,minimum=60):
    p=Tables();p.feed(html);p.close()
    if p.stack:raise ValueError('Unclosed source table')
    matches=[t for t in p.tables if t['rows'] and tuple(t['rows'][0])==HEADER]
    if len(matches)!=1 or matches[0]['nested']:raise ValueError('Unreviewed regional roster table layout')
    records=[]
    for i,row in enumerate(matches[0]['rows'][1:],1):
        if len(row)!=len(HEADER):raise ValueError('Source row width changed')
        # Only organization fields; do not retain contacts, phone numbers or raw HTML.
        name,street,city,state,postal,code=(row[j] for j in (0,2,3,4,5,11))
        if not name or any(len(s)>400 or re.search(r'[\x00-\x1f\x7f]',s) for s in (name,street,city,state,postal,code)):raise ValueError('Invalid organization row')
        if code and not re.fullmatch(r'\d{1,12}',code):raise ValueError('Unexpected source agency code format')
        fields={'name':name,'headquartersStreetAsReported':street or None,'cityAsReported':city or None,'stateAsReported':state or None,'postalCodeAsReported':postal or None,'agencyCodeAsReported':code or None}
        fingerprint=sha(json.dumps(fields,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode())
        records.append({**fields,'sourceRow':i,'recordFingerprint':fingerprint,'reviewKey':'NY-WREMSCO:row:'+str(i)+':'+fingerprint[:16],'endUserValidationRequired':True,'publicationEligible':False})
    if not minimum<=len(records)<=500:raise ValueError('Unexpected regional roster size')
    counts=collections.Counter(r['agencyCodeAsReported'] for r in records if r['agencyCodeAsReported'])
    for r in records:
        code=r['agencyCodeAsReported']
        r['agencyCodeStatus']='missing' if not code else 'duplicate' if counts[code]>1 else 'non-four-digit' if len(code)!=4 else 'unique-as-reported'
    return records
def candidate_index(national):
    idx=collections.defaultdict(list)
    for r in national:
        key=native_key(r)
        if not key or r[3]!='NY' or r[9] or not r[4] or not zip5(r[5]):continue
        idx[(name_key(r[2]),name_key(r[4]),zip5(r[5]))].append((key,r))
    return idx
def reconcile(rows,national):
    idx=candidate_index(national)
    for r in rows:
        city=r['cityAsReported'];z=zip5(r['postalCodeAsReported'] or '')
        hits=[]
        if r['agencyCodeStatus']=='unique-as-reported' and (r['stateAsReported'] or '').upper() in ('NY','NEW YORK') and city and z:
            hits=[{'sourceKey':key,'name':n[2],'city':n[4],'postalCode':n[5],'source':n[1]} for key,n in idx.get((name_key(r['name']),name_key(city),z),[])]
        r['nationalReviewCandidates']=sorted(hits,key=lambda x:x['sourceKey'])
    return rows
def report(raw,national,national_hash):
    rows=reconcile(parse(raw.decode('utf-8-sig')),national)
    return {'schemaVersion':1,'jurisdiction':'NY','sourceName':'Westchester Regional EMS Council','sourceUrl':SOURCE,'authorityReference':AUTHORITY,'sourceDate':None,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(raw),'nationalRegistrySha256':national_hash,'publication':'review-only','scope':'Regional organization directory; headquarters fields as reported, no assigned county, statewide completeness, licensure, or operational station verification. Includes organizations headquartered outside the council region.','counts':{'records':len(rows),'codeStatus':dict(collections.Counter(r['agencyCodeStatus'] for r in rows)),'nationalMatchStatus':dict(collections.Counter('singleCandidate' if len(r['nationalReviewCandidates'])==1 else 'multipleCandidates' if r['nationalReviewCandidates'] else 'noCandidate' for r in rows))},'records':rows,'verifiedStations':0,'newMapped':0}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    with build_opener(NoRedirect()).open(Request(SOURCE,headers={'Accept':'text/html','User-Agent':'ATLAS public organization source research/1.0'}),timeout=45) as res:raw=res.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise ValueError('Source exceeds size bound')
    _,national=read_registry();result=report(raw,national,sha((PUBLIC/'national/index.json').read_bytes()))
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'ny-westchester-agency-review.json').write_text(json.dumps(result,indent=2,ensure_ascii=True)+'\n')
    print('Westchester regional EMS research:',json.dumps(result['counts']))
if __name__=='__main__':main()
