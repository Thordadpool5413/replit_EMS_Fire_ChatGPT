import copy,unittest
from recover_nad_locations import resolve_point,parse_features,query_params,county_index,recover
A={'street':'123 Main Street, Suite 2','city':'Example','state':'FL','zip':'32901'}
C=county_index([{'USPS':'FL','GEOID':'12009','NAME':'Brevard County'},{'USPS':'FL','GEOID':'12011','NAME':'Broward County'}])
F={'attributes':{'OBJECTID':1,'AddNo_Full':'123','StNam_Full':'MAIN ST','Post_City':'Example','Inc_Muni':'Example','State':'FL','Zip_Code':'32901','County':'Brevard','Placement':'Structure - Rooftop','AddrClass':'Numbered Thoroughfare Address','Lifecycle':'Active','NAD_Source':'Example county'},'geometry':{'x':-80.6,'y':28.1}}
def feature(**updates):
 f=copy.deepcopy(F);f['attributes'].update(updates);return f
class NadTests(unittest.TestCase):
 def test_exact_match_and_provenance(self):
  point,status=resolve_point(A,[F],C,'12009')
  self.assertEqual(status,'mapped');self.assertEqual(point[1],'12009');self.assertEqual(point[0]['method'],'nad-address-point');self.assertEqual(point[0]['point']['objectId'],1)
  for f in [feature(AddNo_Full='124'),feature(StNam_Full='OTHER ST'),feature(Zip_Code='32902'),feature(State='GA'),feature(Post_City='Other',Inc_Muni='Other'),feature(Placement='Linear Geocode'),feature(Lifecycle='Retired'),feature(County='Unknown')]:
   self.assertIsNone(resolve_point(A,[f],C)[0])
  self.assertIsNone(resolve_point(A,[F],C,'12011')[0])
 def test_conflicting_points_and_truncation(self):
  f=feature(OBJECTID=2);f['geometry']['x']=-80.7
  self.assertEqual(resolve_point(A,[F,f],C)[1],'ambiguous')
  self.assertEqual(resolve_point(A,[F,feature(OBJECTID=2,County='Broward')],C,'12009')[1],'review')
  self.assertRaises(ValueError,parse_features,{'spatialReference':{'wkid':4326},'features':[F],'exceededTransferLimit':True})
  self.assertRaises(ValueError,parse_features,{'spatialReference':{'wkid':3857},'features':[F]})
  self.assertEqual(parse_features({'features':[]}),[])
  self.assertRaises(ValueError,query_params,'FL',[A]*9)
  self.assertRaises(ValueError,parse_features,{'spatialReference':{'wkid':4326},'features':[F,F]})
 def test_targeted_query_and_preservation(self):
  q=query_params('FL',[A]);self.assertIn("State='FL'",q['where']);self.assertIn("Zip_Code='32901'",q['where']);self.assertIn('Add_Number=123',q['where'])
  self.assertNotIn('UPPER(',q['where']);self.assertNotIn('StNam_Full',q['where']);self.assertRaises(ValueError,query_params,'GA',[A])
  old={'key':'old','state':'FL','status':'mapped','address':A,'sourceCounty':'12009','match':{'method':'census-address-range'}}
  new={'key':'new','state':'FL','status':'no-match','address':A,'sourceCounty':'12009','match':None,'countyFips':''}
  before=copy.deepcopy(old)
  result=recover([old,new],C,{'FL'},1,0,lambda u,p:{'spatialReference':{'wkid':4326},'features':[F]})
  self.assertEqual(old,before);self.assertEqual(new['status'],'mapped');self.assertEqual(result['mapped'],1)
 def test_bounded_single_address_retry_and_outage(self):
  entries=[{'key':str(n),'state':'FL','status':'no-match','address':{**A,'street':str(n)+' Main Street'},'sourceCounty':'12009','match':None,'countyFips':''} for n in (123,124,125,126)]
  before=copy.deepcopy(entries);calls=[]
  def unavailable(url,params):
   calls.append(params['where']);raise TimeoutError('fixture')
  stats=recover(entries,C,{'FL'},4,0,unavailable,batch_size=1)
  self.assertEqual(len(calls),3);self.assertTrue(all(' OR ' not in q for q in calls))
  self.assertEqual(stats['unavailable'],3);self.assertEqual(stats['not_attempted'],1);self.assertEqual(entries,before)
  self.assertRaises(ValueError,recover,entries,C,{'FL'},4,0,unavailable,batch_size=9)
if __name__=='__main__':unittest.main()
