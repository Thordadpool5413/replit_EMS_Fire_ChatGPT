#!/usr/bin/env python3
"""Validate review-only public leadership observations; does not query or modify app data."""
import argparse, collections, datetime, hashlib, json, pathlib, re, unicodedata
from urllib.parse import urlsplit
HOSTS={'www.orlando.gov','www.tampa.gov','www.houstontx.gov','www.phila.gov','dallascityhall.com'}
STATES={'FL','TX','PA'}
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT/'research/leadership/municipal-leadership-2026-11-25.json'
def clean(v):
 return isinstance(v,str) and 0<len(v)<=300 and v==v.strip() and not re.search(r'[\x00-\x1f\x7f]',v)
def normalized(v):return ' '.join(unicodedata.normalize('NFKC',v).casefold().split())
def url(v):
 if not clean(v):return False
 try:
  p=urlsplit(v)
  return p.scheme=='https' and p.hostname in HOSTS and not p.username and not p.password and p.port is None and not p.fragment
 except ValueError:return False
def phone(v):return clean(v) and bool(re.fullmatch(r'[+0-9(). -]{7,30}',v)) and len(re.sub(r'\D','',v)) in (10,11)
def validate(data):
 if data.get('schemaVersion')!=1 or not clean(data.get('scope')):raise ValueError('Invalid snapshot')
 d=datetime.date.fromisoformat(data['reviewedOn'])
 if d.isoformat()!=data['reviewedOn'] or d>datetime.datetime.now(datetime.timezone.utc).date():raise ValueError('Invalid review date')
 groups=data.get('groups')
 if not isinstance(groups,list) or not 1<=len(groups)<=50:raise ValueError('Invalid group count')
 seen=set();people=set();count=collections.Counter()
 for g in groups:
  if set(g)!={'organization','state','city','officialDirectory','departmentPhone','departmentPhoneSource','registryIdentity','associationStatus','contacts'}:raise ValueError('Unexpected organization field')
  if not clean(g['organization']) or not clean(g['city']) or g['state'] not in STATES or not url(g['officialDirectory']) or g['registryIdentity'] is not None or g['associationStatus']!='needs-native-identity-review':raise ValueError('Unreviewed organization association')
  key=(g['state'],normalized(g['city']),normalized(g['organization']))
  if key in seen:raise ValueError('Duplicate organization')
  seen.add(key)
  if g['departmentPhone'] is not None:
   if not phone(g['departmentPhone']) or not url(g['departmentPhoneSource']):raise ValueError('Invalid department phone')
   count['departmentPhones']+=1
  elif g['departmentPhoneSource'] is not None:raise ValueError('Phone provenance without value')
  if not isinstance(g['contacts'],list) or not 1<=len(g['contacts'])<=100:raise ValueError('Invalid contacts')
  for c in g['contacts']:
   if set(c)!={'name','title','sourceUrl','professionalEmail','professionalPhone','corroborationUrl','authority','endUserValidationRequired'}:raise ValueError('Unexpected contact field')
   if not clean(c['name']) or not clean(c['title']) or not url(c['sourceUrl']) or c['authority']!='not-established' or c['endUserValidationRequired'] is not True:raise ValueError('Invalid or inferred contact')
   if normalized(c['name']) in ('open','- open -','unknown','vacant'):raise ValueError('Vacant role is not a person')
   if c['corroborationUrl'] is not None and not url(c['corroborationUrl']):raise ValueError('Invalid secondary source')
   k=(*key,normalized(c['name']))
   if k in people:raise ValueError('Duplicate person observation; reconcile before release')
   people.add(k)
   if c['professionalEmail'] is not None:
    if not clean(c['professionalEmail']) or not re.fullmatch(r'[A-Za-z0-9._+-]+@orlando\.gov',c['professionalEmail']) or urlsplit(c['sourceUrl']).hostname!='www.orlando.gov':raise ValueError('Invalid or unsupported public email')
    count['individualEmails']+=1
   if c['professionalPhone'] is not None:
    if not phone(c['professionalPhone']):raise ValueError('Invalid phone')
    count['individualPhones']+=1
   count['roleObservations']+=1
 return {'organizations':len(seen),'states':len({g['state'] for g in groups}),**dict(count),'linkedProviders':0,'establishedPurchasingAuthority':0}
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path);args=p.parse_args()
 raw=SOURCE.read_bytes();result=validate(json.loads(raw));summary={**result,'sha256':hashlib.sha256(raw).hexdigest()}
 print('Leadership review summary:',json.dumps(summary),flush=True)
 if args.output:
  args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(summary,indent=2)+'\n')
if __name__=='__main__':main()
