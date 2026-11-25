import copy,json,unittest
from audit_leadership_candidates import validate,SOURCE
class LeadershipReviewTests(unittest.TestCase):
 def test_snapshot_and_no_automatic_authority(self):
  data=json.loads(SOURCE.read_bytes());r=validate(data)
  self.assertEqual(r['organizations'],5);self.assertEqual(r['roleObservations'],28)
  self.assertEqual(r['individualEmails'],5);self.assertEqual(r['individualPhones'],5)
  self.assertEqual(r['linkedProviders'],0)
 def test_unsafe_and_inferred_records_rejected(self):
  data=json.loads(SOURCE.read_bytes())
  for field,value in [('authority','final-approval'),('endUserValidationRequired',False),('sourceUrl','https://www.orlando.gov@evil.example/'),('professionalEmail','guess@example.org'),('name','- Open -')]:
   bad=copy.deepcopy(data);bad['groups'][0]['contacts'][0][field]=value
   with self.assertRaises(ValueError):validate(bad)
  bad=copy.deepcopy(data);bad['groups'][0]['contacts'].append(bad['groups'][0]['contacts'][0])
  with self.assertRaises(ValueError):validate(bad)
  bad=copy.deepcopy(data);bad['groups'][0]['registryIdentity']='FDID:FL:12345'
  with self.assertRaises(ValueError):validate(bad)
