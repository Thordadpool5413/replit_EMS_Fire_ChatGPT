#!/usr/bin/env python3
"""Acquire an official organization roster as a review candidate; never publish app records."""
import argparse, datetime, hashlib, json, pathlib, re, tempfile, zipfile
from urllib.request import Request, build_opener, HTTPRedirectHandler
from openpyxl import load_workbook
SOURCE='https://www.dshs.texas.gov/sites/default/files/CP-EMSTraumaSystems/compliance/docs/emsproviderroster.xlsx'
FIRST_RESPONDER_SOURCE='https://www.dshs.texas.gov/sites/default/files/CP-EMSTraumaSystems/compliance/docs/emsfirstresponderroster.xlsx'
ROSTERS={'provider':SOURCE,'first-responder':FIRST_RESPONDER_SOURCE}
REFERENCE='https://www.dshs.texas.gov/dshs-ems-trauma-systems/open-records-requests'
MAX_BYTES=12_000_000
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def norm(v):return re.sub(r'[^a-z0-9]+',' ',str(v or '').lower()).strip()
ALIASES={
 'identifier':{'license number','license no','license','lic number','lic no','lic nbr','license nbr','provider license number','license id','registration number','registration no','registration nbr','registration id','fro number','fro id','fro registration number'},
 'name':{'organization name','provider name','business name','licensee name','name','ems provider name','facility name','entity name','first responder organization name','first responder name','fro name','organization'},
 'addressAsReported':{'address','address 1','address1','street address','business address','physical address','mailing address'},
 'city':{'city','business city','mailing city','physical city'},
 'state':{'state','state code','business state','mailing state','physical state'},
 'zip':{'zip','zip code','zipcode','postal code','business zip','mailing zip'},
 'status':{'license status','status','credential status'},
 'licenseType':{'license type','credential type','provider type','license description'},
 'issuedOn':{'issue date','issued date','original issue date','initial issue date'},
 'expiresOn':{'expiration date','expiry date','expire date','license expiration date','expiration'},
 'serviceLevel':{'service level','level of service','ems service level'},
}
# Exact 21-column schema observed in both live DSHS workbooks, row 2.
OFFICIAL_HEADERS=('license type','license type rank','primary name','dba name','license number','license status','license secondary status','license expiration date','first licensure date','rank date','public health region','trauma service area','mailing address 1','mailing address 2','mailing city','mailing state','mailing zip','mailing county','mailing phone','mailing email address','station count')
OFFICIAL_COLUMNS={'identifier':'license number','name':'primary name','dbaName':'dba name','licenseType':'license type','licenseRankAsReported':'license type rank','status':'license status','secondaryStatus':'license secondary status','issuedOn':'first licensure date','expiresOn':'license expiration date','rankDateAsReported':'rank date','addressAsReported':'mailing address 1','mailingAddress2':'mailing address 2','city':'mailing city','state':'mailing state','zip':'mailing zip','mailingCounty':'mailing county','stationCountAsReported':'station count'}
def count(v):
 if v in (None,''):return None
 if isinstance(v,str) and re.fullmatch(r'\d{1,5}',v.strip()):v=int(v.strip())
 if type(v) is not int or not 0<=v<=99999:raise ValueError('Invalid source station count')
 return v
def text(v,maxlen=300):
 if v is None:return None
 if not isinstance(v,str):raise ValueError('Unexpected text field type')
 s=v.strip()
 if not s:return None
 if len(s)>maxlen or re.search(r'[\x00-\x1f\x7f]',s):raise ValueError('Invalid text field')
 return s
def day(v):
 if v in (None,''):return None
 if isinstance(v,datetime.datetime):return v.date().isoformat()
 if isinstance(v,datetime.date):return v.isoformat()
 if isinstance(v,str):
  for fmt in ('%Y-%m-%d','%m/%d/%Y'):
   try:return datetime.datetime.strptime(v.strip(),fmt).date().isoformat()
   except ValueError:pass
 raise ValueError('Unexpected date format')
def stage(path,out,minimum=100,kind='provider',require_official=False):
 if kind not in ROSTERS:raise ValueError('Unsupported organization roster')
 if path.stat().st_size>MAX_BYTES:raise ValueError('Workbook too large')
 with zipfile.ZipFile(path) as z:
  if sum(i.file_size for i in z.infolist())>100_000_000 or len(z.infolist())>250:raise ValueError('Expanded workbook exceeds bounds')
 wb=load_workbook(path,read_only=True,data_only=False,keep_links=False)
 try:
  matches=[];schema=[]
  for ws in wb.worksheets:
   if not ws.max_column or not ws.max_row or ws.max_column>100 or ws.max_row>10000:raise ValueError('Workbook dimensions exceed bounds')
   recognized=[];header_candidates=[]
   for i,cells in enumerate(ws.iter_rows(max_row=min(ws.max_row,20)),1):
    headers=[norm(c.value) for c in cells]
    cols={k:[j for j,h in enumerate(headers) if h in aliases] for k,aliases in ALIASES.items()}
    recognized.append(sorted({h for h in headers if any(h in a for a in ALIASES.values())}))
    # Emit header labels only when the row has the unmistakable published
    # column names; never print organization records or contact data.
    if {'license number','license status','license expiration date','license type','mailing city','mailing state','mailing zip'}<=set(headers):
     if len(headers)>100 or any(len(h)>120 for h in headers):raise ValueError('Unexpected header length')
     header_candidates.append({'row':i,'headers':headers,'recognizedColumns':{k:v for k,v in cols.items() if v}})
    elif all(len(cols[k])>=1 for k in ('identifier','name')):
     header_candidates.append({'row':i,'recognizedColumns':{k:v for k,v in cols.items() if v}})
    if tuple(headers)==OFFICIAL_HEADERS:
     matches.append((ws,i,{k:headers.index(v) for k,v in OFFICIAL_COLUMNS.items()},headers))
    elif not require_official and all(len(cols[k])==1 for k in ('identifier','name')) and all(len(v)<=1 for v in cols.values()):
     matches.append((ws,i,{k:v[0] for k,v in cols.items() if v},headers))
   schema.append({'sheetIndex':len(schema),'rows':ws.max_row,'columns':ws.max_column,'recognizedHeaderTokens':max(recognized,key=len,default=[]),'headerCandidates':header_candidates})
  digest=hashlib.sha256(path.read_bytes()).hexdigest()
  out.mkdir(parents=True,exist_ok=True)
  (out/'schema-review.json').write_text(json.dumps({'sha256':digest,'sheets':schema},indent=2)+'\n')
  if len(matches)!=1:
   print('Roster schema diagnostic:',json.dumps(schema),flush=True)
   raise ValueError('Roster schema requires manual review')
  ws,start,cols,headers=matches[0]
  records=[];seen=set()
  for row_number,cells in enumerate(ws.iter_rows(min_row=start+1),start+1):
   if all(c.value in (None,'') for c in cells):continue
   if any(cells[j].data_type=='f' for j in cols.values()):raise ValueError('Formula in roster field')
   cell=cells[cols['identifier']];raw=cell.value
   # Excel's explicit all-zero display format preserves leading zeros; General does not.
   if type(raw) is int and 0<=raw<=999999999999999 and re.fullmatch(r'0{2,15}',cell.number_format or ''):
    raw=str(raw).zfill(len(cell.number_format))
   if not isinstance(raw,str):raise ValueError(f'Identifier requires manual format review (row {row_number}, cell type {type(raw).__name__}, display format {cell.number_format!r})')
   id=text(raw,80)
   if not id or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 .-]{0,79}',id) or id.upper() in seen:raise ValueError('Invalid or duplicate native license identifier')
   seen.add(id.upper());row={'identifier':id}
   for k,j in cols.items():
    if k=='identifier':continue
    value=cells[j].value
    try:
     if k in ('issuedOn','expiresOn','rankDateAsReported'):row[k]=day(value)
     elif k=='stationCountAsReported':row[k]=count(value)
     elif k=='zip' and type(value) is int and 10000<=value<=99999:row[k]=str(value)
     else:row[k]=text(value)
    except ValueError as exc:raise ValueError(f'Invalid roster field {k} at row {row_number} (cell type {type(value).__name__}): {exc}') from exc
   if not row['name']:raise ValueError('Missing organization name')
   if row.get('issuedOn') and row.get('expiresOn') and row['expiresOn']<row['issuedOn']:
    # The actual DSHS provider workbook contains a reversed first-licensure/expiry pair.
    # Preserve the source record and flag the contradiction, never repair dates or
    # infer eligibility. Generic unreviewed workbook schemas remain fail-closed.
    if tuple(headers)!=OFFICIAL_HEADERS:raise ValueError('Reversed license dates')
    row['licenseDateConflict']=True
   elif tuple(headers)==OFFICIAL_HEADERS:row['licenseDateConflict']=False
   row['endUserValidationRequired']=True;records.append(row)
  if not minimum<=len(records)<=5000:raise ValueError('Unexpected roster size')
  result={'schemaVersion':1,'jurisdiction':'TX','sourceName':'Texas Department of State Health Services','sourceUrl':ROSTERS[kind],'rosterKind':kind,'identifierKind':'license' if kind=='provider' else 'registration','referenceUrl':REFERENCE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'sourceDate':None,'sourceSha256':digest,'identifierColumn':headers[cols['identifier']],'nameColumn':headers[cols['name']],'addressColumn':headers[cols['addressAsReported']] if 'addressAsReported' in cols else None,'addressPurpose':'mailing-only' if tuple(headers)==OFFICIAL_HEADERS else 'not-established','stationCountMeaning':'Source-reported aggregate; no individual station identifiers or locations.' if 'stationCountAsReported' in cols else None,'issuedOnMeaning':'First licensure date as reported, not current credential issue date' if tuple(headers)==OFFICIAL_HEADERS else None,'licenseDateConflictCount':sum(r.get('licenseDateConflict') is True for r in records),'scope':'Review-only organization roster; license or registration identifiers are distinct, addresses may be mailing addresses, and current operational status and station locations are not established.','records':records}
  (out/('TX-candidate.json' if kind=='provider' else 'TX-first-responder-candidate.json')).write_text(json.dumps(result,indent=2)+'\n')
  return result
 finally:wb.close()
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--kind',choices=sorted(ROSTERS),default='provider');args=p.parse_args()
 with tempfile.TemporaryDirectory() as tmp:
  path=pathlib.Path(tmp)/'roster.xlsx'
  with build_opener(NoRedirect()).open(Request(ROSTERS[args.kind],headers={'User-Agent':'ATLAS public organization roster review'}),timeout=60) as res:data=res.read(MAX_BYTES+1)
  if len(data)>MAX_BYTES:raise ValueError('Download exceeds bound')
  path.write_bytes(data);result=stage(path,args.output,kind=args.kind,require_official=True)
  print('Texas roster acquisition:',json.dumps({'kind':args.kind,'records':len(result['records']),'sourceSha256':result['sourceSha256'],'addressColumn':result['addressColumn'],'licenseDateConflicts':result['licenseDateConflictCount'],'publication':'review-only'}))
if __name__=='__main__':main()
