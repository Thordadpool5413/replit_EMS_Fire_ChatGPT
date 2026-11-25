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
