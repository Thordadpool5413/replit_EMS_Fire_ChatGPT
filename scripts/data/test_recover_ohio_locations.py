import copy,unittest
from recover_ohio_locations import query,features,resolve,recover,service_version
from recover_nad_locations import county_index
A={'street':'29 W Third ST','city':'Manchester','state':'OH','zip':'45144'}
C=county_index([{'USPS':'OH','NAME':'Adams County','GEOID':'39001'},{'USPS':'OH','NAME':'Brown County','GEOID':'39015'}])
F={'attributes':{'OBJECTID':1,'HOUSENUM':29,'LHN':'29','LSN':'W THIRD STREET','STATE':'OH','COUNTY':'Adams','ZIPCODE':'45144','USPS_CITY':'MANCHESTER'},'geometry':{'x':-83.6,'y':38.7}}
class OhioTests(unittest.TestCase):
 def test_exact_source_point(self):
  v,status=resolve(A,[F],C,'39001','2025-06-24')
  self.assertEqual(status,'mapped');self.assertEqual(v[0],'39001');self.assertEqual(v[1]['method'],'ohio-lbrs-address-point')
  self.assertIn("HOUSENUM=29 AND ZIPCODE='45144'",query([A])['where'])
  for field,value in [('LSN','Other Street'),('USPS_CITY','Other'),('ZIPCODE','45145'),('STATE','KY'),('COUNTY','Brown'),('LHN','30')]:
   bad=copy.deepcopy(F);bad['attributes'][field]=value
   self.assertIsNone(resolve(A,[bad],C,'39001','2025-06-24')[0])
 def test_ambiguity_and_bounds(self):
  bad=copy.deepcopy(F);bad['attributes']['OBJECTID']=2;bad['geometry']['x']=-83.7
  self.assertEqual(resolve(A,[F,bad],C,'39001','2025-06-24')[1],'ambiguous')
  self.assertRaises(ValueError,features,{'features':[F],'exceededTransferLimit':True})
  self.assertRaises(ValueError,features,{'features':[F,F],'spatialReference':{'wkid':4326}})
  self.assertEqual(features({'features':[]}),[])
 def test_preserves_existing_matches(self):
  old={'key':'old','state':'OH','status':'mapped','address':A,'sourceCounty':'39001','match':{'method':'census-address-range'}}
  new={'key':'new','state':'OH','status':'no-match','address':A,'sourceCounty':'39001','match':None,'countyFips':''}
  before=copy.deepcopy(old)
  result=recover([old,new],C,'2025-06-24',1,0,lambda *_:{'features':[F],'spatialReference':{'wkid':4326}})
  self.assertEqual(old,before);self.assertEqual(new['status'],'mapped');self.assertEqual(result['mapped'],1)
if __name__=='__main__':unittest.main()
