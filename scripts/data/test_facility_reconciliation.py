import unittest,copy
from audit_facility_reconciliation import build_queue
def fixture(key,status='source-missing'):
    return dict(key=key,name='CI fixture',state='FL',source='USFA',sourceCounty='12057',countyFips='',status=status,address=None,match=None)
def candidate(key):
    return dict(key=key,name='CI fixture',state='FL',countyFips='12057',decision='needs-review',reason='CI fixture only',sources=[dict(authority='Fixture',url='https://example.gov/source',note='Fixture only')],candidateAddress=dict(street='123 Main St',city='Example',state='FL',zip='33602'))
class FacilityQueueTests(unittest.TestCase):
    def test_review_only_and_county_conflict(self):
        a=fixture('a');b=fixture('b','mapped');b.update(countyFips='12103',match={'latitude':27,'longitude':-82})
        c=fixture('c','no-match');c['address']=dict(street='123 Main St',city='Example',state='FL',zip='33602')
        entries=[a,b,c];original=copy.deepcopy(entries)
        report=build_queue(entries,dict(accepted=[],unresolved=[]),dict(records=[candidate('a')]))
        self.assertEqual(report['counts'],{'county-conflict':1,'missing-source-address':1})
        self.assertEqual(report['records'][0]['key'],'b');self.assertEqual(report['records'][1]['nextAction'],'independent-facility-confirmation')
        self.assertTrue(all(x['endUserValidationRequired'] for x in report['records']))
        self.assertEqual(entries,original)
    def test_conflict_candidate_and_bad_evidence(self):
        c=candidate('a');c['decision']='conflict-withheld'
        report=build_queue([fixture('a')],dict(accepted=[],unresolved=[]),dict(records=[c]))
        self.assertEqual(report['records'][0]['nextAction'],'resolve-source-conflict')
        for field,value in [('countyFips','12103'),('name','Wrong agency'),('decision','approved'),('sources',[])]:
            bad={**c,field:value}
            with self.assertRaises(ValueError):build_queue([fixture('a')],dict(accepted=[],unresolved=[]),dict(records=[bad]))
    def test_existing_accepted_address_stays_supplemental(self):
        c=candidate('a');c.update(address=c['candidateAddress'],sourceUrl='https://example.gov/source')
        r=build_queue([fixture('a')],dict(accepted=[c],unresolved=[]),dict(records=[]))
        self.assertEqual(r['records'][0]['nextAction'],'coordinate-check-supplemental-address')
        self.assertIsNone(r['records'][0]['sourceAddress'])
if __name__=='__main__':unittest.main()
