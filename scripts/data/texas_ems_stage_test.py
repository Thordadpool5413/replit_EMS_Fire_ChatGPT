import tempfile,pathlib,unittest
from openpyxl import Workbook
from stage_texas_ems import stage
class TexasStageTest(unittest.TestCase):
 def test_preserve_native_id_and_reject_duplicate(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';out=pathlib.Path(td)/'review'
   w=Workbook();s=w.active
   s.append(['License Number','Provider Name','Expiration Date','Administrator'])
   s.append(['00123','CI fixture','2027-01-01','Not retained']);w.save(p)
   r=stage(p,out,1)
   self.assertEqual(r['records'][0]['identifier'],'00123')
   self.assertEqual(r['records'][0]['expiresOn'],'2027-01-01')
   self.assertNotIn('Administrator',r['records'][0])
   s.append(['00123','CI duplicate','2027-01-01','']);w.save(p)
   with self.assertRaises(ValueError):stage(p,out,1)
 def test_numeric_identifier_rejected(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';w=Workbook();s=w.active
   s.append(['License Number','Provider Name']);s.append([123,'CI fixture']);w.save(p)
   with self.assertRaises(ValueError):stage(p,pathlib.Path(td)/'review',1)
