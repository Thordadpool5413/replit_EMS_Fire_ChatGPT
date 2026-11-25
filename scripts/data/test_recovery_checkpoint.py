import unittest
from recovery_checkpoint import RecoveryCheckpoint
class RecoveryCheckpointTests(unittest.TestCase):
    def test_only_recent_identical_negative_results_are_deferred(self):
        e={'key':'fixture','source':'USFA','state':'NC','sourceDate':'2026-11-17','name':'Fixture','address':{'street':'123 Main St'},'sourceCounty':'37001','status':'no-match'}
        version={'lastEditDate':123,'fields':['test']}
        c=RecoveryCheckpoint();c.bind('nc-addressnc',version,'2026-11-25')
        c.record(e,'no-match');c.record({**e,'key':'positive'},'mapped');c.record({**e,'key':'ambiguous'},'ambiguous')
        with self.assertRaises(ValueError):c.report()
        c.finish();prior=c.report()
        d=RecoveryCheckpoint(prior);d.bind('nc-addressnc',version,'2026-11-26')
        self.assertTrue(d.defer(e));self.assertFalse(d.defer({**e,'key':'positive'}));self.assertFalse(d.defer({**e,'key':'ambiguous'}));self.assertFalse(d.defer({**e,'sourceCounty':'37003'}));self.assertFalse(d.defer({**e,'address':{'street':'124 Main St'}}))
        d.finish();self.assertEqual(d.report()['rows']['fixture']['checkedAt'],'2026-11-25')
        for source,v,date in [('nc-addressnc',version,'2026-12-03'),('nc-addressnc',{'lastEditDate':124},'2026-11-26'),('other',version,'2026-11-26'),('nc-addressnc',{'lastEditDate':None},'2026-11-26')]:
            d.bind(source,v,date);self.assertFalse(d.defer(e))
        c.bind('nc-addressnc',{'lastEditDate':None},'2026-11-25');c.record(e,'no-match');c.finish()
        d=RecoveryCheckpoint(c.report());d.bind('nc-addressnc',{'lastEditDate':None},'2026-11-26');self.assertFalse(d.defer(e))

    def test_blocked_source_never_creates_reusable_checkpoint(self):
        from run_recovery_checkpoint import blocked_report
        from recover_regional_locations import SourceUnavailable
        r=blocked_report('nc-addressnc','0'*64,'2026-11-25',SourceUnavailable('unavailable'))
        self.assertEqual(r['acquisitionStatus'],'source-blocked')
        self.assertFalse(r['completeMetadataCheck'])
        self.assertEqual(r['rows'],{})
        self.assertEqual(r['candidates'],[])
        c=RecoveryCheckpoint(r);c.bind('nc-addressnc',{'lastEditDate':123},'2026-11-25')
        self.assertFalse(c.defer({'key':'fixture'}))
