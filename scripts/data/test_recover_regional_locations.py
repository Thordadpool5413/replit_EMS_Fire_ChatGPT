import copy,unittest
from recover_regional_locations import query,features,resolve,combine
from regional_point_contract import valid_regional_point
from recover_nad_locations import county_index
C=county_index([{'USPS':'NC','NAME':'Alamance County','GEOID':'37001'}])
CHECKED='2026-11-24'
def example(state='NC'):
 return dict(key='test-fixture',state=state,status='no-match',sourceCounty='37001' if state=='NC' else '12057',countyFips='',match=None,address={'street':'123 Main Street','city':'Example','state':state,'zip':'27215' if state=='NC' else '33602'})
def nc():
 return dict(attributes=dict(objectid=10,add_number='123',st_address='123 MAIN ST',post_code='27215',post_comm='EXAMPLE',state='NC',statefips='37',county='Alamance',countyfips='001',placement='Structure',dateupdate=None,effective=None,expire=None,gc_exception=None,unit=None,building=None,floor=None),geometry=dict(x=-79.4,y=36.1))
class RegionalTests(unittest.TestCase):
 def test_nc_exact_point(self):
  f=nc();e=example()
  hit,status=resolve('nc-addressnc',e,[f],C,CHECKED)
  self.assertEqual(status,'mapped');self.assertEqual(hit[0],'37001')
  self.assertTrue(valid_regional_point(hit[1],'37001'))
  self.assertIn("add_number='123' AND post_code='27215'",query('nc-addressnc',[e['address']])['where'])
  for field,value in [('st_address','124 MAIN ST'),('post_comm','OTHER'),('post_code','27216'),('countyfips','003'),('placement','Geocode'),('gc_exception','bad'),('unit','7'),('state','VA')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value
   self.assertIsNone(resolve('nc-addressnc',e,[bad],C,CHECKED)[0],field)
 def test_county_active_primary_points(self):
  e=example('FL')
  f=dict(attributes=dict(OBJECTID=4,ADDRNUM='123',FULLADDR='123 MAIN ST',ZIP='33602',POSTALCOMM='EXAMPLE',STATUS='Current',POINTTYPE='Location',UNITTYPE=None,UNITID=None,LASTUPDATE=None),geometry=dict(x=-82.46,y=27.97))
  found,status=resolve('fl-hillsborough',e,[f],C,CHECKED);self.assertEqual(status,'mapped')
  for field,value in [('STATUS','Inactive'),('POINTTYPE','Utility'),('UNITID','2'),('POSTALCOMM','Other')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value;self.assertIsNone(resolve('fl-hillsborough',e,[bad],C,CHECKED)[0])
  p=dict(attributes=dict(OBJECTID=4,ADDRNUM='123',FULLADDR='123 MAIN ST',POSTCODE='33701',MAILINGCITY='EXAMPLE',STATUS='A',BLDGADDRCLASS='Primary',POINTTYPE=None,UNITTYPE=None,UNITID=None,LAST_EDITED_DATE=None),geometry=dict(x=-82.65,y=27.78))
  pin=example('FL');pin['sourceCounty']='12103';pin['address']['zip']='33701'
  self.assertEqual(resolve('fl-pinellas',pin,[p],C,CHECKED)[1],'mapped')
  p['attributes']['POINTTYPE']='Cell Tower';self.assertIsNone(resolve('fl-pinellas',pin,[p],C,CHECKED)[0])
 def test_new_jersey_active_primary_exact_county(self):
  counties=county_index([{'USPS':'NJ','NAME':'Mercer County','GEOID':'34021'},{'USPS':'NJ','NAME':'Bergen County','GEOID':'34003'}])
  domain={'mercer-fixture':'Mercer County','bergen-fixture':'Bergen County'}
  e=dict(key='nj-test-fixture',state='NJ',status='no-match',sourceCounty='34021',countyFips='',match=None,address={'street':'123 Main Street','city':'Example','state':'NJ','zip':'08608'})
  f=dict(attributes=dict(OBJECTID=6,ADD_NUMBER=123,FULLADDR='123 MAIN ST',POST_CODE='08608',POST_COMM='EXAMPLE',STATE='NJ',COUNTRY='US',COUNTY='mercer-fixture',SUBTYPE=1210,PRIMARYPT='Y',STATUS='A',BUILDING=None,FLOOR=None,UNIT=None,ROOM=None,SEAT=None,PLACEMENT='Structure - Rooftop',DATEUPDATE=None,EFFECTIVE=None,EXPIRE=None),geometry=dict(x=-74.75,y=40.22))
  hit,status=resolve('nj-addresspoints',e,[f],counties,CHECKED,domain)
  self.assertEqual(status,'mapped');self.assertEqual(hit[0],'34021');self.assertTrue(valid_regional_point(hit[1],'34021'))
  q=query('nj-addresspoints',[e['address']])['where'];self.assertIn("ADD_NUMBER=123 AND POST_CODE='08608'",q);self.assertIn("PRIMARYPT='Y'",q)
  for field,value in [('COUNTY','bergen-fixture'),('COUNTY','unmapped'),('STATUS','R'),('PRIMARYPT','N'),('SUBTYPE',1220),('UNIT','3'),('POST_COMM','OTHER'),('FULLADDR','124 MAIN ST'),('STATE','PA'),('PLACEMENT','Linear Geocode'),('COUNTRY','CA')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value
   self.assertIsNone(resolve('nj-addresspoints',e,[bad],counties,CHECKED,domain)[0],field)
  bad=copy.deepcopy(f);bad['attributes']['OBJECTID']=7;bad['geometry']['x']=-74.76
  self.assertEqual(resolve('nj-addresspoints',e,[f,bad],counties,CHECKED,domain)[1],'ambiguous')
 def test_tx_pa_regional_sources(self):
  counties=county_index([{'USPS':'TX','NAME':'Collin County','GEOID':'48085'},{'USPS':'TX','NAME':'Denton County','GEOID':'48121'},{'USPS':'PA','NAME':'Cumberland County','GEOID':'42041'}])
  for source,state,county,name,city,zip_code,x,y in [('tx-prosper','TX','48085','Collin County','Prosper','75078',-96.8,33.2),('pa-cumberland','PA','42041','Cumberland County','Carlisle','17013',-77.2,40.2)]:
   e=dict(key='fixture',state=state,status='no-match',sourceCounty=county,countyFips='',match=None,address={'street':'123 Main Street','city':city,'state':state,'zip':zip_code})
   f=dict(attributes=dict(OBJECTID=5,Add_Number=123,Address='123 MAIN ST',Post_Comm=city,Post_Code=zip_code,County=name,State=state,Country='US',Building=None,Wing=None,Floor=None,Unit=None,Room=None,Seat=None,Stru_Priority='Primary',GC_Exception=None,DiscrpAgID='cumberland.state.pa.us',Placement='Structure',DateUpdate=None,Effective=None,Expire=None),geometry=dict(x=x,y=y))
   hit,status=resolve(source,e,[f],counties,CHECKED)
   self.assertEqual(status,'mapped');self.assertEqual(hit[0],county);self.assertTrue(valid_regional_point(hit[1],county))
   self.assertIn('Add_Number=123',query(source,[e['address']])['where'])
   for field,value in [('County','Unknown'),('Country','CA'),('Unit','3'),('Placement','Geocoding'),('Address','124 MAIN ST')]:
    bad=copy.deepcopy(f);bad['attributes'][field]=value
    self.assertIsNone(resolve(source,e,[bad],counties,CHECKED)[0],field)
 def test_stratmap_statewide_exact_address_unknown_placement(self):
  from recover_regional_locations import stratmap_date
  counties=county_index([{'USPS':'TX','NAME':'Travis County','GEOID':'48453'},{'USPS':'TX','NAME':'Williamson County','GEOID':'48491'}])
  e=dict(key='tx-stratmap-fixture',state='TX',status='no-match',sourceCounty='48453',countyFips='',match=None,address={'street':'123 Main Street','city':'Austin','state':'TX','zip':'78701'})
  f=dict(attributes=dict(objectid=7,dateupdate='2026-01-01',add_number='123',full_addr='123 MAIN ST',building=None,floor=None,unit=None,post_comm='AUSTIN',post_code='78701',state='TX',country='US',county='Travis County',fips=48453,source='fixture authority',date_acq=None),geometry=dict(x=-97.74,y=30.27))
  hit,status=resolve('tx-stratmap',e,[f],counties,CHECKED)
  self.assertEqual(status,'mapped');self.assertEqual(hit[0],'48453');self.assertEqual(hit[1]['point']['placement'],'Placement not reported');self.assertTrue(valid_regional_point(hit[1],'48453'))
  self.assertEqual(stratmap_date('2026-01-01T12:00:00Z'),'2026-01-01');self.assertIsNone(stratmap_date('01/02/2026'))
  self.assertIn("add_number='123'",query('tx-stratmap',[e['address']]*16)['where'])
  for field,value in [('fips',48491),('county','Williamson County'),('source',''),('unit','7'),('post_code','78702'),('state','OK'),('full_addr','124 Main Street'),('country','CA')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value
   self.assertIsNone(resolve('tx-stratmap',e,[bad],counties,CHECKED)[0],field)
  bad=copy.deepcopy(f);bad['attributes']['objectid']=8;bad['geometry']['x']=-97.75
  self.assertEqual(resolve('tx-stratmap',e,[f,bad],counties,CHECKED)[1],'ambiguous')
 def test_multistate_county_adapters(self):
  from recover_regional_locations import COUNTY_ADAPTERS
  cases=[('il-peoria','IL','17143','Peoria County','Peoria','61602',-89.59,40.69,'STRUCTURE'),('il-lake','IL','17097','Lake County','Waukegan','60085',-87.85,42.36,'STRUCTURE'),('pa-northampton','PA','42095','Northampton County','Easton','18042',-75.22,40.69,'Placement not reported'),('al-baldwin','AL','01003','Baldwin County','Bay Minette','36507',-87.77,30.88,'Structure')]
  for source,state,county,name,city,postal,x,y,placement in cases:
   adapter=COUNTY_ADAPTERS[source]
   counties=county_index([{'USPS':state,'NAME':name,'GEOID':county}])
   e=dict(key='fixture',state=state,status='no-match',sourceCounty=county,countyFips='',match=None,address={'street':'123 Main Street','city':city,'state':state,'zip':postal})
   fields=dict(OBJECTID=6,State=state,Country='US',County=name,Effective=None,Expire=None)
   fields.update({k:None for k in adapter['sub']});fields.update({adapter['house']:123 if adapter['integer'] else '123',adapter['postal']:postal,adapter['city']:city,adapter['street']:'123 MAIN ST',adapter['date']:None})
   if adapter['placement']:fields[adapter['placement']]=placement
   if adapter.get('status'):fields[adapter['status']]='Active'
   feature=dict(attributes=fields,geometry=dict(x=x,y=y))
   hit,status=resolve(source,e,[feature],counties,CHECKED)
   self.assertEqual(status,'mapped',source);self.assertTrue(valid_regional_point(hit[1],county))
   self.assertIn(adapter['postal']+"='"+postal+"'",query(source,[e['address']])['where'])
   for key,value in [('County','Unknown County'),('Country','CA'),(adapter['street'],'124 MAIN ST'),(adapter['sub'][0],'Suite 7')]:
    bad=copy.deepcopy(feature);bad['attributes'][key]=value;self.assertIsNone(resolve(source,e,[bad],counties,CHECKED)[0],(source,key))
   if adapter['placement']:
    bad=copy.deepcopy(feature);bad['attributes'][adapter['placement']]='Geocoding';self.assertIsNone(resolve(source,e,[bad],counties,CHECKED)[0])
   if adapter.get('status'):
    bad=copy.deepcopy(feature);bad['attributes'][adapter['status']]='Retired';self.assertIsNone(resolve(source,e,[bad],counties,CHECKED)[0])
 def test_preserve_and_withhold(self):
  e=example();hit,_=resolve('nc-addressnc',e,[nc()],C,CHECKED)
  f=nc();f['attributes']['objectid']=11;f['geometry']['x']=-79.41
  self.assertEqual(resolve('nc-addressnc',e,[nc(),f],C,CHECKED)[1],'ambiguous')
  self.assertEqual(combine([e],{'a':{e['key']:hit}},{e['key']})[0]['conflicts_withheld'],1);self.assertEqual(e['status'],'no-match')
  stats,_=combine([e],{'a':{e['key']:hit}},set());self.assertEqual(stats['newMapped'],1)
  with self.assertRaises(ValueError):combine([e],{'a':{e['key']:hit}},set())
  with self.assertRaises(ValueError):features('nc-addressnc',{'features':[nc(),nc()],'spatialReference':{'wkid':4326}})
  with self.assertRaises(ValueError):features('nc-addressnc',{'features':[],'exceededTransferLimit':True})
if __name__=='__main__':unittest.main()

class IndianaTests(unittest.TestCase):
 def test_exact_structure_and_county(self):
  counties=county_index([{'USPS':'IN','NAME':'Marion County','GEOID':'18097'},{'USPS':'IN','NAME':'Hamilton County','GEOID':'18057'}])
  e=dict(key='fixture',state='IN',status='no-match',sourceCounty='18097',countyFips='',match=None,address={'street':'123 Main Street','city':'Example','state':'IN','zip':'46201'})
  f=dict(attributes=dict(objectid=12,add_number=123,st_name='MAIN',st_postyp='Street',post_comm='EXAMPLE',post_code='46201',state='IN',country='US',county='Marion County',county_fips='18097',placement='Structure',dateupdate=None,effective=None,expire=None),geometry=dict(x=-86.1,y=39.8))
  hit,status=resolve('in-data-harvest',e,[f],counties,CHECKED)
  self.assertEqual(status,'mapped');self.assertTrue(valid_regional_point(hit[1],'18097'))
  self.assertIn("add_number=123 AND post_code='46201'",query('in-data-harvest',[e['address']])['where'])
  for field,value in [('county_fips','18057'),('county','Hamilton County'),('placement','Geocoding'),('placement','Parcel'),('unit_id','2'),('addnum_suf','A'),('st_name','OTHER'),('post_comm','Other'),('country','CA'),('state','OH')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value
   self.assertIsNone(resolve('in-data-harvest',e,[bad],counties,CHECKED)[0],field)
  bad=copy.deepcopy(f);bad['attributes']['objectid']=13;bad['geometry']['x']=-86.2
  self.assertEqual(resolve('in-data-harvest',e,[f,bad],counties,CHECKED)[1],'ambiguous')

class FultonTests(unittest.TestCase):
 def test_active_main_address_and_exact_county(self):
  e=dict(key='fixture',state='GA',status='no-match',sourceCounty='13121',countyFips='',match=None,address={'street':'123 Main Street','city':'Atlanta','state':'GA','zip':'30303'})
  f=dict(attributes=dict(OBJECTID=12,StNumber=123,Label='123 MAIN ST',City='Atlanta',PrefCity='Atlanta',State='GA',Zip='30303',PtType='Main Address',Status='Active',CreateDate=None),geometry=dict(x=-84.39,y=33.75))
  hit,status=resolve('ga-fulton',e,[f],{},CHECKED)
  self.assertEqual(status,'mapped');self.assertTrue(valid_regional_point(hit[1],'13121'))
  self.assertIsNone(hit[1]['point']['recordUpdatedAt'])
  self.assertIn("StNumber=123 AND Zip='30303'",query('ga-fulton',[e['address']])['where'])
  for field,value in [('PtType','Sub Address'),('Status','Inactive'),('UnitActual','2'),('StrNumberHi','125'),('Label','124 MAIN ST'),('Zip','30304'),('State','AL'),('City','Other')]:
   bad=copy.deepcopy(f);bad['attributes'][field]=value
   if field=='City':bad['attributes']['PrefCity']='Other'
   self.assertIsNone(resolve('ga-fulton',e,[bad],{},CHECKED)[0],field)
  self.assertIsNone(resolve('ga-fulton',{**e,'sourceCounty':'13089'},[f],{},CHECKED)[0])
  bad=copy.deepcopy(f);bad['attributes']['OBJECTID']=13;bad['geometry']['x']=-84.41
  self.assertEqual(resolve('ga-fulton',e,[f,bad],{},CHECKED)[1],'ambiguous')
