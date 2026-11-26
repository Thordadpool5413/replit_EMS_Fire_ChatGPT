#!/usr/bin/env python3
"""Acquire official NY DOH historical organization directories, never create agency accounts."""
import argparse,collections,datetime,hashlib,json,pathlib,re,subprocess,tempfile
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
BASE='https://www.health.ny.gov/professionals/ems/'
REFERENCE=BASE+'counties/'
SOURCES={
 'agency-codes':{'url':BASE+'state_trauma/docs/ems_agency_listing_with_codes.pdf','title':'Agency Name (DBA1) (DBA2) (BEMS Agency Code)'},
 'ambulance-als':{'url':BASE+'pdf/agency_list_aalffrs.pdf','title':'Listing of Ambulance and Advanced Life Support First Response Services in New York','expectedPages':151,'date':'2024-08-08'},
 'bls-nontransport':{'url':BASE+'pdf/agency_list_blsnt.pdf','title':'Basic Life Support Non-Transporting EMS Agencies','expectedPages':81,'date':'2024-08-08'}}
MAX_BYTES=20_000_000
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def sha(raw):return hashlib.sha256(raw).hexdigest()
def norm(s):return ' '.join(s.split())
def fetch(kind):
    with build_opener(NoRedirect()).open(Request(SOURCES[kind]['url'],headers={'Accept':'application/pdf','User-Agent':'ATLAS public agency registry research/1.0'}),timeout=60) as res:
        raw=res.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES or not raw.startswith(b'%PDF-'):raise ValueError('Unexpected PDF payload')
    return raw
def pages(path):
    result=subprocess.run(['pdftotext','-layout','-enc','UTF-8',str(path),'-'],check=True,capture_output=True,timeout=60)
    if len(result.stdout)>15_000_000:raise ValueError('PDF extraction exceeds bound')
    decoded=result.stdout.decode('utf-8')
    pp=decoded.split('\f')
    if pp and not pp[-1].strip():pp.pop()
    if not pp or len(pp)>500 or any(not p.strip() for p in pp):raise ValueError('Empty or oversized PDF page extraction')
    return pp
def parse_codes(pp,minimum=800):
    # Only the trailing four-digit BEMS code is an identifier. Other parentheses
    # can contain DBA or organization details; preserve the printed name in full.
    header=SOURCES['agency-codes']['title'];records=[];seen=set()
    for page_num,page in enumerate(pp,1):
        pending=[];found=0
        for line in page.splitlines():
            line=norm(line)
            if not line:continue
            if line==header:
                if pending:raise ValueError('Header interrupts agency name')
                continue
            if re.fullmatch(r'(?:Page )?\d+ of \d+',line,re.I) or re.fullmatch(r'\d+',line):raise ValueError('Unreviewed code directory footer')
            pending.append(line)
            joined=' '.join(pending)
            if len(joined)>600 or len(pending)>4:raise ValueError('Unrecognized code directory row layout at page '+str(page_num))
            m=re.fullmatch(r'(.+?)\s+\((\d{4})\)',joined)
            if not m:continue
            name,identifier=m.groups()
            if not re.search(r'[A-Za-z]',name) or identifier in seen or re.search(r'[\x00-\x1f\x7f]',name):raise ValueError('Invalid or duplicate BEMS code at page '+str(page_num))
            seen.add(identifier);records.append({'sourceKey':'NY-BEMS:agency-code:'+identifier,'identifier':identifier,'nameAsReported':name,'sourcePage':page_num,'endUserValidationRequired':True,'publicationEligible':False});pending=[];found+=1
        if pending or not found:raise ValueError('Incomplete code directory page '+str(page_num))
    if not minimum<=len(records)<=5000:raise ValueError('Unexpected code directory record count')
    if header not in norm(pp[0]):raise ValueError('Missing agency code directory title')
    return records
def inspect_county_pages(kind,pp):
    """Capture only observed header positions, dates, county labels and page coverage.
    Detailed row decoding is deliberately separate from this geometry inventory."""
    source=SOURCES[kind];inventory=[];county=None
    if len(pp)!=source['expectedPages']:raise ValueError('County report page count changed; review edition')
    for i,page in enumerate(pp,1):
        lines=page.splitlines();headers=[]
        for line in lines[:30]:
            for label in ('Service Name','Service ID','Mailing Address','License Type','Expiration Date','Ownership','Level of Care','Service Type','Num Ambulances','Funding Eligible'):
                if label in line:headers.append({'label':label,'column':line.index(label)})
            m=re.fullmatch(r'County of ([A-Za-z .-]{2,50})',norm(line))
            if m:county=m.group(1)
        normalized=norm(page)
        if source['title'] not in normalized or not re.search(r'\bPage\s+'+str(i)+r'\s+of\s+'+str(len(pp))+r'\b',normalized) or not re.search(r'\b8/8/(?:2024|24)\b',normalized):raise ValueError('County report title, page or date changed at page '+str(i))
        labels={h['label'] for h in headers}
        # Only header column observations, never infer row assignments from them.
        if not {'Service Name','Service ID','Mailing Address','License Type'}<=labels:raise ValueError('Unrecognized county report header at page '+str(i))
        if not county:raise ValueError('No reported county at page '+str(i))
        inventory.append({'page':i,'countyAsReported':county,'headers':headers})
    return {'pages':inventory,'countyLabels':sorted({r['countyAsReported'] for r in inventory}),'sourceDate':source['date'],'parsedOrganizationCount':0,'rowExtractionStatus':'layout-review-required'}
def acquire(kind,out):
    raw=fetch(kind);source=SOURCES[kind]
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        path=pathlib.Path(tmp)/'source.pdf';path.write_bytes(raw)
        pp=pages(path)
        # Retain a rendered sample for layout QA. It is an acquisition artifact,
        # never a public application asset.
        subprocess.run(['pdftoppm','-f','1','-l','1','-scale-to','1600','-png',str(path),str(out/'source-layout')],check=True,capture_output=True,timeout=60)
        report={'schemaVersion':1,'jurisdiction':'NY','sourceKind':kind,'sourceName':'New York State Department of Health','sourceUrl':source['url'],'referenceUrl':REFERENCE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(raw),'pageCount':len(pp),'publication':'review-only','sourceDate':None,'verifiedStations':0,'newMapped':0}
        if kind=='agency-codes':
            report['records']=parse_codes(pp);report['identifierKind']='BEMS agency-code';report['sourceDate']=None
            report['scope']='Agency code and name only; no current license status, county or location established.'
            report['parsedOrganizationCount']=len(report['records'])
        else:
            report.update(inspect_county_pages(kind,pp))
            report['scope']='Historical county report layout only. Addresses are labeled mailing; no current certification or operating site inferred.'
        (out/'NY-source-review.json').write_text(json.dumps(report,ensure_ascii=True,indent=2)+'\n')
        # Preserve source bytes in the acquisition artifact for reproducibility,
        # not the app or the public source catalog.
        (out/'source.pdf').write_bytes(raw)
        print('NY EMS acquisition:',json.dumps({k:report[k] for k in ('sourceKind','sourceSha256','pageCount','parsedOrganizationCount','sourceDate','publication','newMapped')}))
def main():
    p=argparse.ArgumentParser();p.add_argument('--kind',choices=SOURCES,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    try:acquire(a.kind,a.output)
    except (HTTPError,URLError,TimeoutError) as exc:
        print('NY EMS source unavailable:',a.kind,type(exc).__name__,str(exc)[:200],flush=True)
        raise
if __name__=='__main__':main()
