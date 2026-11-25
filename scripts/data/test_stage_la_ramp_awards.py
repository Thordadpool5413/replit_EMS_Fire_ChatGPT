import datetime, unittest
from stage_la_ramp_awards import acquire,normalize,query
TODAY=datetime.date(2026,11,25)
ROW={'source_id':'row-abc','name':'LIFEPAK defibrillator and ambulance equipment','awarddept':'CI department','awarddate':'2026-11-01T00:00:00','vendorname':'CI vendor','awardamt':'123.45','vendorphone':'never retained'}
class LaRampTests(unittest.TestCase):
 def test_exact_public_fields_and_duplicate_topics(self):
  def fetch(params):
   return [ROW] if 'defibrillator' in params['$where'] or 'ambulance' in params['$where'] else []
  r=acquire(TODAY,fetch)
  self.assertEqual(r['summary']['distinctAwards'],1)
  self.assertEqual(r['summary']['repeatSourceRows'],1)
  c=r['candidates'][0]
  self.assertNotIn('vendorphone',c);self.assertEqual(c['amountAsReported'],'123.45')
  self.assertTrue(c['endUserValidationRequired'])
  self.assertNotIn('vendorphone',query('cardiac',TODAY)['$select'])
 def test_conflicts_and_failure(self):
  def fetch(params):
   return [ROW] if 'defibrillator' in params['$where'] else [{**ROW,'vendorname':'Different'}] if 'ambulance' in params['$where'] else []
  self.assertEqual(acquire(TODAY,fetch)['summary']['conflictingIdentitiesWithheld'],1)
  self.assertIsNone(normalize({**ROW,'source_id':"x' OR 1=1"},'cardiac',TODAY))
  self.assertIsNone(normalize({**ROW,'awarddate':'2027-01-01'},'cardiac',TODAY))
  def fail(params):raise OSError('source unavailable')
  with self.assertRaises(ValueError):acquire(TODAY,fail)
