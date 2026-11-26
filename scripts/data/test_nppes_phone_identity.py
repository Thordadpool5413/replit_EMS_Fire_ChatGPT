import unittest
from recover_nppes_phone_identity import phone,possible_phones,name_basis,government_basis,county_binding
class NativePhoneIdentityTests(unittest.TestCase):
 def cms(self,legal='Example Fire Department',alternate='',kind=''):
  return {'native':{'Provider Organization Name (Legal Business Name)':legal,'Provider Other Organization Name':alternate,'Provider Other Organization Name Type Code':kind},'primaryAddress':{'city':'Example'}}
 def test_business_phone_requires_complete_valid_digits(self):
  self.assertEqual(phone('+1 (212) 234-5678'),'2122345678')
  self.assertIsNone(phone('212-234-5678 ext 12'))
  self.assertIn('2122345678',possible_phones('212-234-5678 ext 12'))
  self.assertIsNone(phone('111-111-1111'));self.assertIsNone(phone('212-555-1234'))
 def test_only_native_type_3_is_an_explicit_dba(self):
  native={'Fire dept name':'Example Fire Department'}
  for kind in('4','5',''):
   self.assertIsNone(name_basis(self.cms('Unrelated Company','Example Fire Department',kind),native,None))
  self.assertEqual(name_basis(self.cms('Unrelated Company','Example Fire Department','3'),native,None)['cmsNameField'],'native-dba-type-3')
 def test_complete_name_must_not_be_a_substring_match(self):
  self.assertIsNone(name_basis(self.cms('Example Fire Department North'),{'Fire dept name':'Example Fire Department'},None))
 def test_government_owner_requires_exact_native_place_and_explicit_agency(self):
  self.assertIsNotNone(government_basis('City of Example','Example Fire Department','Example',None))
  self.assertIsNone(government_basis('City of Example','Other Fire Department','Example',None))
  self.assertIsNone(government_basis('City of Example','Example Ambulance Company','Example',None))
  self.assertIsNone(government_basis('City of Example','Example Fire Department','Other',None))
 def test_township_cannot_drop_its_explicit_jurisdiction(self):
  self.assertIsNone(government_basis('Township of Example','Example Fire Department','Example',None))
  self.assertIsNotNone(government_basis('Township of Example','Example Township Fire Department','Example',None))
 def test_native_county_conflicts_are_retained(self):
  original={'sourceCounty':'36001','state':'NY'};counties={'36001':{'state':'NY','name':'Albany County'}}
  self.assertTrue(county_binding({'County':'Albany'},original,counties)[0])
  self.assertFalse(county_binding({'County':'Suffolk'},original,counties)[0])
if __name__=='__main__':unittest.main()
