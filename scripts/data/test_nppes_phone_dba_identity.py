import copy,unittest
from recover_nppes_phone_dba_identity import reference_name_basis
from retain_nppes_other_names import FIELDS
class NativeReferenceDbaTests(unittest.TestCase):
 def record(self):
  return {'npi':'1234567893','native':{'Provider Organization Name (Legal Business Name)':'Unrelated Legal Company',
   'Provider Other Organization Name':'','Provider Other Organization Name Type Code':''},'primaryAddress':{'city':'Example'}}
 def witness(self,kind='3',name='Example Fire Department',npi='1234567893'):
  return {'sourceRowNumber':17,'nativeRecordSha256':'native-row-sha','native':{FIELDS[0]:npi,FIELDS[1]:name,FIELDS[2]:kind,FIELDS[3]:'2026-11-02'}}
 def resolve(self,witness):
  return reference_name_basis(self.record(),{'Fire dept name':'Example Fire Department'},None,{'1234567893':[witness]},'source-report-sha')
 def test_explicit_complete_type3_reference_retains_actual_native_row(self):
  witness=self.witness();basis=self.resolve(witness)
  self.assertEqual(basis['cmsNameField'],'native-other-name-reference-type-3')
  self.assertEqual(basis['nativeOtherNameRecords'],[witness]);self.assertEqual(basis['referenceSource']['reportSha256'],'source-report-sha')
 def test_former_legal_and_unspecified_other_name_never_become_dba(self):
  for kind in('4','5','', '03'):
   self.assertIsNone(self.resolve(self.witness(kind)))
 def test_reference_name_is_not_a_generic_or_substring_alias(self):
  self.assertIsNone(self.resolve(self.witness(name='Example Fire Department North')))
  self.assertIsNone(reference_name_basis(self.record(),{'Fire dept name':'Fire Department'},None,
   {'1234567893':[self.witness(name='Fire Department')]},'source-report-sha'))
 def test_reference_cannot_move_across_npi_identity(self):
  with self.assertRaises(ValueError):self.resolve(self.witness(npi='1999999999'))
 def test_existing_primary_native_name_rule_stays_byte_equivalent(self):
  record=self.record();record['native']['Provider Organization Name (Legal Business Name)']='Example Fire Department'
  basis=reference_name_basis(record,{'Fire dept name':'Example Fire Department'},None,{},'source-report-sha')
  self.assertEqual(basis,{'rule':'normalized-complete-native-name','cmsNameField':'legal-name','cmsNativeName':'Example Fire Department',
   'usfaNativeName':'Example Fire Department','otherOrganizationNameTypeCode':None})
if __name__=='__main__':unittest.main()
