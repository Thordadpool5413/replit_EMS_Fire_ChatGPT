#!/usr/bin/env python3
"""Acquire public LA RAMP awards, not installed equipment or current bid status."""
import argparse, collections, datetime, hashlib, json, pathlib, re
from decimal import Decimal, InvalidOperation
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.parse import urlencode
ENDPOINT='https://data.lacity.org/resource/h8mw-iegk.json'
CATALOG='https://data.lacity.org/City-Infrastructure-Service-Requests/RAMP-Opportunity-Awards/h8mw-iegk'
FIELDS=':id as source_id,name,awardamt,awarddept,contractno,oppid,awarddate,expdate,vendorname,opptitle'
TOPICS={'cardiac':('defibrillator','cardiac monitor','lifepak','heartstart','zoll'),
'cpr':('mechanical cpr','chest compression','autopulse','lucas device','lucas 3'),
'ventilation':('ventilator','hamilton medical','z vent','oxylog'),
'ambulance':('ambulance','emergency medical services','emergency medical equipment'),
'software':('patient care report','epcr','ambulance billing','ems billing','computer aided dispatch','imagetrend','traumasoft')}
LIMIT=100
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def request(params):
 url=ENDPOINT+'?'+urlencode(params)
 with build_opener(NoRedirect()).open(Request(url,headers={'Accept':'application/json','User-Agent':'ATLAS public procurement research'}),timeout=35) as res:raw=res.read(2_000_001)
 if len(raw)>2_000_000:raise ValueError('Source response exceeds bound')
 data=json.loads(raw)
 if not isinstance(data,list) or len(data)>LIMIT+1:raise ValueError('Unexpected source response')
 return data
def query(topic,today):
 terms=TOPICS[topic];start=today-datetime.timedelta(days=1095)
 condition=' OR '.join("lower("+field+") like '%"+term+"%'" for field in ('name','opptitle') for term in terms)
 return {'$select':FIELDS,'$where':"awarddate >= '"+start.isoformat()+"T00:00:00' AND awarddate <= '"+today.isoformat()+"T23:59:59.999' AND ("+condition+")",'$order':'awarddate DESC, :id ASC','$limit':str(LIMIT+1)}
def text(v,n=500):
 return v.strip() if isinstance(v,str) and v.strip() and len(v)<=n and not re.search(r'[\x00-\x1f\x7f]',v) else None
def day(v):
 if not isinstance(v,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)?',v):return None
 try:return datetime.date.fromisoformat(v[:10]).isoformat()
 except ValueError:return None
def amount(v):
 if v is None:return None
 try:
  d=Decimal(str(v))
  return str(d) if d.is_finite() and abs(d)<=Decimal('1000000000000000') else None
 except (InvalidOperation,ValueError):return None
def match(s,topic):
 value=' '+re.sub(r'[^a-z0-9]+',' ',(s or '').lower()).strip()+' '
 return any(' '+term+' ' in value or ' '+term+'s ' in value for term in TOPICS[topic])
def normalize(row,topic,today):
 if not isinstance(row,dict):return None
 id=text(row.get('source_id'),120);title=text(row.get('name'));opp=text(row.get('opptitle'));dept=text(row.get('awarddept'),300)
 published=day(row.get('awarddate'))
 if not id or not re.fullmatch(r'[A-Za-z0-9:_-]+',id) or not (title or opp) or not dept or not published or not (today-datetime.timedelta(days=1095)).isoformat()<=published<=today.isoformat() or not (match(title,topic) or match(opp,topic)):return None
 return {'source':'la-ramp-awards','nativeId':id,'awardTitle':title,'opportunityTitle':opp,'awardingDepartment':dept,'contractNumber':text(row.get('contractno'),160),'opportunityId':text(row.get('oppid'),160),'awardDate':published,'expirationAsReported':day(row.get('expdate')),'amountAsReported':amount(row.get('awardamt')),'vendor':text(row.get('vendorname'),300),'sourceUrl':ENDPOINT+'?'+urlencode({'$select':FIELDS,'$where':":id = '"+id+"'"}),'endUserValidationRequired':True,'interpretation':'Published award, not active contract, operating location or installed fleet'}
def acquire(today,fetch=request):
 scopes=[];records={};conflicts=set();repeated=0
 for topic in TOPICS:
  try:
   raw=fetch(query(topic,today))
   if not isinstance(raw,list) or len(raw)>LIMIT+1:raise ValueError('Invalid source page')
  except (OSError,ValueError,TypeError,TimeoutError):
   scopes.append({'topic':topic,'status':'unavailable','sourceRows':0,'withheld':0});continue
  withheld=0
  for row in raw[:LIMIT]:
   record=normalize(row,topic,today)
   if not record:withheld+=1;continue
   key=record['nativeId']
   if key in records:
    if records[key]['record']!=record:conflicts.add(key)
    else:records[key]['topics'].add(topic);repeated+=1
   else:records[key]={'record':record,'topics':{topic}}
  scopes.append({'topic':topic,'status':'partial' if len(raw)>LIMIT or withheld else 'retrieved','sourceRows':min(len(raw),LIMIT),'withheld':withheld})
 if all(s['status']=='unavailable' for s in scopes):raise ValueError('All LA RAMP scopes unavailable')
 candidates=[{**v['record'],'topics':sorted(v['topics'])} for k,v in sorted(records.items()) if k not in conflicts]
 return {'schemaVersion':1,'sourceUrl':CATALOG,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Los Angeles regional awarding departments; 1095-day window, five topics, at most 100 source rows each. No inferred provider match.','scopes':scopes,'summary':{'distinctAwards':len(candidates),'repeatSourceRows':repeated,'conflictingIdentitiesWithheld':len(conflicts),'unavailableScopes':sum(s['status']=='unavailable' for s in scopes),'partialScopes':sum(s['status']=='partial' for s in scopes)},'candidates':candidates}
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
 report=acquire(datetime.datetime.now(datetime.timezone.utc).date())
 raw=(json.dumps(report,indent=2)+'\n').encode()
 if len(raw)>4_000_000:raise ValueError('Review artifact exceeds bound')
 args.output.mkdir(parents=True,exist_ok=True)
 (args.output/'la-award-candidates.json').write_bytes(raw)
 summary={**report['summary'],'sha256':hashlib.sha256(raw).hexdigest()}
 (args.output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 print('LA RAMP acquisition summary:',json.dumps(summary),flush=True)
if __name__=='__main__':main()
