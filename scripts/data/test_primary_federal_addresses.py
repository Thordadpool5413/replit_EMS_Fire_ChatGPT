import unittest
from recover_primary_federal_addresses import recover,metric,addr_key
class PrimaryRecoveryTests(unittest.TestCase):
    def record(self,key,status='no-match',county='12009',street='123 Main Street'):
        return {'key':key,'source':'USFA','state':'FL','status':status,'sourceCounty':county,'countyFips':'','address':{'street':street,'city':'Example','state':'FL','zip':'32901'},'match':None}
    def test_exact_address_recovery_and_no_overwrite(self):
        a=self.record('a');b=self.record('b',street='124 Main Street');c=self.record('c',county='12011');d=self.record('d','historical')
        m={'latitude':28.1,'longitude':-80.6,'matchedAddress':'123 MAIN ST, Example, FL, 32901','method':'neris-reported-address','point':{'sourceKind':'department','nativeId':'FD123'}}
        stats,evidence=recover([a,b,c,d],{addr_key(a['address']):[(m,'12009')]})
        self.assertEqual(stats['newMapped'],1);self.assertEqual(a['status'],'mapped');self.assertEqual(b['status'],'no-match');self.assertEqual(c['status'],'no-match');self.assertEqual(d['status'],'historical')
        self.assertEqual(metric([a,b,c,d])['requiredMapped'],4);self.assertEqual(metric([a,b,c,d])['remainingToTarget'],3)
        self.assertEqual(evidence[0]['selectedEvidence'],'NERIS:department:FD123')
    def test_coordinate_disagreement_withholds(self):
        a=self.record('a');m={'latitude':28.1,'longitude':-80.6,'matchedAddress':'123 MAIN ST, Example, FL, 32901','method':'neris-reported-address','point':{'sourceKind':'department','nativeId':'FD123'}}
        stats,_=recover([a],{addr_key(a['address']):[(m,'12009'),({**m,'latitude':29.0},'12009')]})
        self.assertEqual(stats['coordinateDisagreement'],1);self.assertIsNone(a['match'])
    def test_exact_existing_address_donor(self):
        a=self.record('a');b=self.record('b','mapped')
        b['countyFips']='12009';b['match']={'latitude':28.1,'longitude':-80.6,'matchedAddress':'123 MAIN ST, Example, FL, 32901','method':'census-address-range'}
        stats,_=recover([a,b],{})
        self.assertEqual(stats['existingExactAddress'],1);self.assertEqual(a['match'],b['match'])
