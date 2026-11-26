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
 def test_explicit_excel_identifier_format_and_roster_kind(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';out=pathlib.Path(td)/'review';w=Workbook();s=w.active
   s.append(['Registration Number','First Responder Organization Name','Mailing Address','Status'])
   s.append([123,'Fixture FRO','PO Box 1','Active']);s['A2'].number_format='00000';w.save(p)
   r=stage(p,out,1,kind='first-responder')
   self.assertEqual(r['records'][0]['identifier'],'00123')
   self.assertEqual(r['identifierKind'],'registration')
   self.assertEqual(r['rosterKind'],'first-responder')
   self.assertEqual(r['addressColumn'],'mailing address')
   self.assertTrue((out/'TX-first-responder-candidate.json').exists())
   self.assertNotIn('latitude',r['records'][0])
   self.assertTrue(r['records'][0]['endUserValidationRequired'])
   s['A2'].number_format='General';w.save(p)
   with self.assertRaises(ValueError):stage(p,out,1,kind='first-responder')

 def test_schema_diagnostic_contains_only_recognized_header_row(self):
  import json
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';out=pathlib.Path(td)/'review';w=Workbook();s=w.active
   s.append(['License Number','License Status','License Expiration Date','License Type','Mailing City','Mailing State','Mailing Zip','Unmapped Organization Column'])
   s.append(['00123','Active','2027-01-01','Provider','Example','TX','75001','Private row text']);w.save(p)
   with self.assertRaises(ValueError):stage(p,out,1)
   raw=(out/'schema-review.json').read_text()
   h=json.loads(raw)['sheets'][0]['headerCandidates'][0]
   self.assertIn('unmapped organization column',h['headers'])
   self.assertNotIn('private row text',raw.lower())
