import copy,unittest
from recover_nppes_native_primary import FIELDS,derive,component_targets,targets_for_snapshot
class NativeComponentTests(unittest.TestCase):
 def record(self,line1='10 Main St',line2='Suite 2'):
  n={k:''for k in FIELDS};n.update({'NPI':'1003000126','Entity Type Code':'2','Provider Organization Name (Legal Business Name)':'Example Ambulance','Healthcare Provider Taxonomy Code_1':'341600000X','Provider First Line Business Practice Location Address':line1,'Provider Second Line Business Practice Location Address':line2,'Provider Business Practice Location Address City Name':'Example','Provider Business Practice Location Address State Name':'NY','Provider Business Practice Location Address Postal Code':'10001','Provider Business Practice Location Address Country Code (If outside U.S.)':'US'})
  r=derive(n,1);r.update(originalStatus='no-match',originalCombinedAddress={'street':line1+', '+line2,'city':'Example','state':'NY','zip':'10001'});return r
 def test_actual_native_line_keeps_component_and_original_proof(self):
  r=self.record();t=component_targets({'records':[r]},'actual-report-sha')
  self.assertEqual(len(t),1);self.assertEqual(t[0]['address']['street'],'10 Main St')
  self.assertEqual(t[0]['componentEvidence']['originalCombinedAddress'],r['originalCombinedAddress'])
  self.assertEqual(t[0]['componentEvidence']['sourceReportSha256'],'actual-report-sha')
 def test_two_distinct_physical_native_lines_are_held(self):
  self.assertEqual(component_targets({'records':[self.record('10 Main St','20 Other St')]},'s'),[])
 def test_mailbox_line_does_not_replace_native_physical_line(self):
  t=component_targets({'records':[self.record('PO BOX 99','20 Other St')]},'s')
  self.assertEqual(t[0]['componentEvidence']['sourceField'],'line2')
 def test_deactivated_native_record_is_not_promoted(self):
  r=self.record();r['deactivationDate']='11/01/2026'
  self.assertEqual(component_targets({'records':[r]},'s'),[])
 def test_raw_field_mutation_changes_native_digest(self):
  r=self.record();n=copy.deepcopy(r['native']);n['Provider Other Organization Name']='Other'
  self.assertNotEqual(derive(n,1)['nativeRecordSha256'],r['nativeRecordSha256'])
if __name__=='__main__':unittest.main()
