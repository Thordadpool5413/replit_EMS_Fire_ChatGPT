import unittest
from build_texas_review_registry import candidate_index,reconcile
class TexasReviewTests(unittest.TestCase):
    def test_exact_source_candidate_only(self):
        row={'name':'Example EMS LLC','dbaName':'Example Rescue','city':'Example','state':'TX','zip':'75001'}
        national=[['nppes:1234567890','NPPES','Example EMS LLC','TX','Example','75001','','','','','',''],['usfa:TX:00123','USFA','Example Rescue','TX','Example','75001','','','','','',''],['usfa:TX:location-fake','USFA','Example Rescue','TX','Example','75001','','','','','',''],['nppes:1234567891','NPPES','Example EMS LLC','TX','Example','75002','','','','','','']]
        hits=reconcile(row,candidate_index(national))
        self.assertEqual([x['sourceKey'] for x in hits],['FDID:TX:00123','NPI:1234567890'])
        self.assertEqual(hits[0]['basis'],['dba-name'])
        self.assertEqual(reconcile({**row,'state':'NM'},candidate_index(national)),[])
        self.assertEqual(reconcile({**row,'city':'Other'},candidate_index(national)),[])
        self.assertEqual(reconcile({**row,'name':'Example EMS','dbaName':None},candidate_index(national)),[])
        self.assertNotIn('latitude',hits[0])
