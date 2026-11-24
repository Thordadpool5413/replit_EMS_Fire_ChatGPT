import csv,io,pathlib,tempfile,unittest,zipfile
from backfill_provider_locations import address,physical,native_key,parse_batch,extract_nppes
class LocationBackfillTests(unittest.TestCase):
 def test_exact_npi_and_practice_location_only(self):
  target=['nppes:1234567893','NPPES','Example EMS','FL','Melbourne','32901','','','unassigned','','','https://example.gov']
  fields=['NPI','Entity Type Code','Provider Organization Name (Legal Business Name)','Provider First Line Business Practice Location Address','Provider Second Line Business Practice Location Address','Provider Business Practice Location Address City Name','Provider Business Practice Location Address State Name','Provider Business Practice Location Address Postal Code','Healthcare Provider Taxonomy Code_1','Provider First Line Business Mailing Address']
  row=['1234567893','2','Example EMS','123 Main Street','Suite 4','Melbourne','FL','32901','341600000X','PO BOX 99']
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'cms.zip'
   def write(rows):
    s=io.StringIO();w=csv.writer(s);w.writerow(fields);w.writerows(rows)
    with zipfile.ZipFile(f,'w') as z:z.writestr('npidata_pfile_fixture.csv',s.getvalue())
   write([row]);hits,conflicts=extract_nppes(f,{'1234567893':target})
   self.assertEqual(hits['1234567893']['street'],'123 Main Street, Suite 4');self.assertFalse(conflicts)
   write([row,row]);hits,conflicts=extract_nppes(f,{'1234567893':target})
   self.assertFalse(hits);self.assertIn('1234567893',conflicts)
   other=row.copy();other[6]='GA';write([other]);self.assertFalse(extract_nppes(f,{'1234567893':target})[0])
 def test_only_exact_unique_street_and_state_county_match(self):
  a=address('123 Main Street, Suite 4','Melbourne','FL','32901')
  expected={'1':a};row=['1','input','Match','Exact','123 MAIN ST, MELBOURNE, FL, 32901','-80.6,28.1','1','L','12','009','000100','1000']
  def encode(rows):
   s=io.StringIO();csv.writer(s).writerows(rows);return s.getvalue()
  self.assertTrue(physical(a));self.assertFalse(physical(address('PO BOX 123','Melbourne','FL','32901')))
  self.assertEqual(parse_batch(encode([row]),expected,{'FL':'12'},{'12009'})['1'][0],'mapped')
  for i,v in [(3,'Equivocate'),(4,'124 MAIN ST, MELBOURNE, FL, 32901'),(8,'13'),(5,'nan,28')]:
   wrong=row.copy();wrong[i]=v;self.assertEqual(parse_batch(encode([wrong]),expected,{'FL':'12'},{'12009'})['1'][0],'no-match')
  with self.assertRaises(ValueError):parse_batch(encode([row,row]),expected,{'FL':'12'},{'12009'})
  with self.assertRaises(ValueError):parse_batch('',expected,{'FL':'12'},{'12009'})
 def test_native_scope(self):
  self.assertEqual(native_key(['usfa:FL:F123','USFA','Example','FL']),'FDID:FL:F123')
  self.assertIsNone(native_key(['usfa:FL:location-123','USFA','Example','FL']))
  self.assertIsNone(native_key(['usfa:FL:FL-FD-12009','USFA','Example','FL']))
if __name__=='__main__':unittest.main()
