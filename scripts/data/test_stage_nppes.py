import csv,json,pathlib,tempfile,unittest
from stage_nppes import stage
class StagingTests(unittest.TestCase):
 def test_scope_deduplication_and_atomic_failure(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);source=root/'input.csv';target=root/'output.ndjson'
   headers=['NPI','Entity Type Code','Provider Organization Name (Legal Business Name)','Healthcare Provider Taxonomy Code_1']
   with source.open('w',newline='') as f:
    writer=csv.writer(f);writer.writerow(headers);writer.writerows([['1234567893','2','County EMS','3416L0300X'],['1234567893','2','County EMS','3416L0300X'],['1234567893','1','Clinician','3416L0300X'],['invalid','2','Agency','3416L0300X']])
   self.assertEqual(stage(source,target,'2026-11','https://download.cms.gov/nppes/'),dict(received=4,accepted=1,excluded=1,rejected=1,duplicates=1))
   before=target.read_text();self.assertEqual(json.loads(before.splitlines()[1])['associationStatus'],'unreviewed')
   source.write_text('bad,headers\n1,2\n')
   with self.assertRaises(ValueError):stage(source,target,'2026-11','https://download.cms.gov/nppes/')
   self.assertEqual(target.read_text(),before)
if __name__=='__main__':unittest.main()
