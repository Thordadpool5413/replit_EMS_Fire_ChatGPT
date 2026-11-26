import copy,unittest
from unittest.mock import patch
from match_tiger_primary import range_fraction,interpolate,range_disagreement
from retain_tiger_primary import validate_tiger_primary_entry
class RangeMathTests(unittest.TestCase):
 def attributes(self,first='10',last='20',parity='E'):
  return {'LFROMHN':first,'LTOHN':last,'PARITYL':parity,'LFROMTYP':'','LTOTYP':'','OFFSETL':''}
 def test_ascending_and_descending_native_number_order(self):
  ascending,_=range_fraction(self.attributes(),'L',12);descending,_=range_fraction(self.attributes('20','10'),'L',12)
  self.assertEqual(ascending['interpolationFraction'],0.2);self.assertEqual(descending['interpolationFraction'],0.8)
 def test_native_parity_is_required(self):
  self.assertEqual(range_fraction(self.attributes(),'L',11),(None,None))
  self.assertEqual(range_fraction(self.attributes(parity=''),'L',12),(None,'unsupported-native-parity'))
  self.assertEqual(range_fraction(self.attributes('11','21','E'),'L',12),(None,'native-range-parity-disagreement'))
 def test_alphanumeric_native_bounds_are_not_reinterpreted(self):
  self.assertEqual(range_fraction(self.attributes('10A','20'),'L',12),(None,'unsupported-native-house-range'))
 def test_single_house_range_is_an_explicit_midpoint(self):
  match,_=range_fraction(self.attributes('12','12'),'L',12);self.assertEqual(match['interpolationFraction'],0.5)
 def test_interpolation_follows_native_bend_instead_of_endpoint_chord(self):
  geometry={'shapeType':3,'parts':[0],'points':[[-75,40],[-75,40.001],[-74.999,40.001]]}
  (latitude,longitude),length=interpolate(geometry,0.5)
  self.assertGreater(latitude,40.0005);self.assertEqual(longitude,-75);self.assertGreater(length,180)
 def test_every_native_range_pair_must_agree(self):
  def point(latitude,county='36001'):return {'latitude':latitude,'longitude':-75,'point':{'countyFips':county}}
  self.assertTrue(range_disagreement([point(40),point(40.0005),point(39.9995)]))
  self.assertFalse(range_disagreement([point(40),point(40.0005)]))
  self.assertTrue(range_disagreement([point(40),point(40,'36003')]))
 def test_zero_length_and_multipart_are_held(self):
  with self.assertRaises(ValueError):interpolate({'shapeType':3,'parts':[0],'points':[[-75,40],[-75,40]]},0.5)
  with self.assertRaises(ValueError):interpolate({'shapeType':3,'parts':[0,2],'points':[[-75,40],[-75,40.001],[-74,41]]},0.5)
class ExactPrimaryBindingTests(unittest.TestCase):
 def test_identity_address_coordinate_and_national_mutations_fail(self):
  old={'key':'NPI:1234567890','name':'Ambulance','source':'NPPES','state':'NY','sourceDate':'2026-11','sourceCounty':'','address':{'street':'12 Main St','city':'Example','state':'NY','zip':'10001'},'status':'no-match'}
  match={'method':'tiger-address-range','latitude':40,'longitude':-75,'point':{'nativeId':'1'}}
  candidate={**old,'countyFips':'36001','match':match};entry={**candidate,'status':'mapped'};national=['native-id','source','name']
  index=({old['key']:candidate},{old['key']:old},{old['key']:national},{},{})
  with patch('retain_tiger_primary.runtime_indexes',return_value=index):
   self.assertTrue(validate_tiger_primary_entry(entry,national))
   for field,value in [('name','Different'),('sourceCounty','36003'),('sourceDate','Other'),('countyFips','36003'),('address',{**old['address'],'street':'14 Main St'}),('match',{**match,'latitude':40.01})]:
    mutated=copy.deepcopy(entry);mutated[field]=value;self.assertFalse(validate_tiger_primary_entry(mutated,national),field)
   self.assertFalse(validate_tiger_primary_entry(entry,national+['different']))
if __name__=='__main__':unittest.main()
