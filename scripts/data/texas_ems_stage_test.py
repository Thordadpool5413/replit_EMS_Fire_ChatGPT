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

 def test_pinned_official_schema_and_contact_exclusion(self):
  from stage_texas_ems import OFFICIAL_HEADERS
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';out=pathlib.Path(td)/'review';w=Workbook();s=w.active
   s.append(['Official fixture report']);s.append(list(OFFICIAL_HEADERS))
   s.append(['EMS Provider','ALS','Primary Organization','Trading Name','00123','Active','Current','2027-01-01','2020-01-01','2024-01-01','region','area','PO Box 7','Suite 3','Example','TX','75001','Example County','000-000-0000','excluded@example.invalid',4]);w.save(p)
   r=stage(p,out,1,require_official=True)
   row=r['records'][0]
   self.assertEqual(row['identifier'],'00123');self.assertEqual(row['name'],'Primary Organization');self.assertEqual(row['dbaName'],'Trading Name')
   self.assertEqual(row['stationCountAsReported'],4);self.assertEqual(row['mailingAddress2'],'Suite 3')
   self.assertEqual(r['addressPurpose'],'mailing-only');self.assertEqual(r['identifierColumn'],'license number')
   self.assertNotIn('excluded@example.invalid',(out/'TX-candidate.json').read_text())
   self.assertNotIn('latitude',row);self.assertNotIn('headquartersAddress',row)
   s['C2']='Different Name';w.save(p)
   with self.assertRaises(ValueError):stage(p,out,1,require_official=True)

 def test_official_date_contradiction_is_retained_and_flagged(self):
  from stage_texas_ems import OFFICIAL_HEADERS
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/'fixture.xlsx';out=pathlib.Path(td)/'review';w=Workbook();s=w.active
   s.append(['Official fixture report']);s.append(list(OFFICIAL_HEADERS))
   s.append(['EMS Provider','ALS','Fixture','DBA','00123','Active',None,'2020-01-01','2021-01-01',None,None,None,'PO Box 7',None,'Example','TX','75001',None,None,None,0]);w.save(p)
   r=stage(p,out,1,require_official=True);row=r['records'][0]
   self.assertTrue(row['licenseDateConflict']);self.assertTrue(row['endUserValidationRequired'])
   self.assertEqual(row['issuedOn'],'2021-01-01');self.assertEqual(row['expiresOn'],'2020-01-01');self.assertEqual(r['licenseDateConflictCount'],1)
