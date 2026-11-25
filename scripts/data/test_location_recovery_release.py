import copy, unittest
from audit_location_gaps import summarize
from check_additive_location_release import compare

def record(key,status='no-match',state='FL',county='12057'):
    return {'key':key,'state':state,'source':'USFA','name':'CI fixture','status':status,'sourceCounty':county,'countyFips':'','match':None,'address':{'street':'123 Main Street','city':'Example','state':state,'zip':'33602'}}
def mapped(e,county='12057'):
    return {**e,'status':'mapped','countyFips':county,'match':{'latitude':27.9,'longitude':-82.4}}
class GapTests(unittest.TestCase):
    def test_rank_and_distinct_counts(self):
        a=record('a');b=record('b');c=mapped(record('c'),'12103');d=mapped(record('d'));e=record('e','historical')
        r=summarize([a,b,c,d,e])
        self.assertEqual(r['totals']['total'],5);self.assertEqual(r['totals']['mappedRaw'],2);self.assertEqual(r['totals']['mappedUsable'],1)
        self.assertEqual(r['totals']['countyConflict'],1);self.assertEqual(r['totals']['recoverable'],2);self.assertEqual(r['distinctAddressTargets'],1)
        self.assertEqual(r['totals']['historical'],1)
        with self.assertRaises(ValueError):summarize([a,a])
    def test_additive_gate(self):
        a=record('a');b=mapped(record('b'))
        self.assertEqual(compare([a,b],[mapped(a),b]),{'newMapped':1,'byState':{'FL':1}})
        for candidate in ([a],[mapped(a,'12103'),b],[{**mapped(a),'name':'Changed'},b],[a,{**b,'match':{}}],[a,a]):
            with self.assertRaises(ValueError):compare([a,b],candidate)
    def test_nonphysical_and_review(self):
        a=record('a');a['address']['street']='PO Box 123'
        r=summarize([a,record('b','review')])
        self.assertEqual(r['totals']['recoverable'],0);self.assertEqual(r['totals']['addressNeedsResearch'],1);self.assertEqual(r['totals']['requiresReview'],1)
if __name__=='__main__':unittest.main()
