import copy,unittest
from unittest.mock import patch
from build_primary_mapping_release import metric,apply_candidate,combine

class PrimaryReleaseTest(unittest.TestCase):
    def test_threshold_counts_usable_original_primary_records(self):
        mapped={'status':'mapped','match':{'method':'census-address-range'},'source':'USFA','sourceCounty':'01001','countyFips':'01001'}
        pending={'status':'no-match','match':None,'source':'USFA','sourceCounty':'01001','countyFips':''}
        records=[mapped]*44451+[pending]*(46791-44451)
        self.assertFalse(metric(records)['targetMet'])
        records[44451]=mapped;self.assertTrue(metric(records)['targetMet'])
        records[0]={**mapped,'countyFips':'01003'}
        result=metric(records);self.assertFalse(result['targetMet']);self.assertEqual(result['usableMapped'],44451);self.assertEqual(result['countyConflictsWithheld'],1)
    def original(self):
        return {'key':'FDID:AK:11100','name':'Example','source':'USFA','state':'AK','sourceDate':'2026-11-26','sourceCounty':'02110','address':{'street':'820 Glacier Ave','city':'Juneau','state':'AK','zip':'99801'},'status':'no-match','match':None,'countyFips':''}
    def candidate(self,method='usgs-structure-address',longitude=-134.42169):
        e=self.original()
        return {'key':e['key'],'originalAddress':e['address'],'address':e['address'],'countyFips':'02110','match':{'method':method,'latitude':58.30107,'longitude':longitude,'point':{'objectId':1}}}
    def test_candidates_cannot_change_source_identity_or_original_address(self):
        e=self.original();c=self.candidate()
        for changes in ({'key':'FDID:AK:OTHER'},{'name':'Different agency'},{'sourceCounty':'02020'},{'originalAddress':None},{'address':dict(e['address'],street='821 Glacier Ave')}):
            with self.assertRaises(ValueError):apply_candidate(e,{**c,**changes})
    def test_qualified_coordinate_conflicts_cannot_be_cherry_picked(self):
        e=self.original();reports=[{'candidates':[self.candidate()]},{'candidates':[self.candidate('hifld-ems-address',-134.44)]}]
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([e],None,reports,{})
        self.assertEqual(rows,[e]);self.assertEqual(len(review['qualifiedSourceConflicts']),1)
    def test_new_station_identity_never_enters_denominator(self):
        c=self.candidate();c['key']+='@NERIS-HQ'
        with self.assertRaises(ValueError):combine([self.original()],None,[{'candidates':[c]}],{})
    def test_consensus_checks_the_entire_point_cluster(self):
        e=self.original();middle=self.candidate();east=self.candidate('hifld-ems-address',-134.42044);west=self.candidate('hifld-fire-address',-134.42294)
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([e],None,[{'candidates':[middle,east,west]}],{})
        self.assertEqual(rows,[e]);self.assertEqual(len(review['qualifiedSourceConflicts']),1)
    def test_legacy_audit_cannot_be_omitted(self):
        e=self.original();e.update(status='mapped',match=self.candidate('neris-reported-address')['match'],countyFips='02110')
        with self.assertRaisesRegex(ValueError,'legacy NERIS audit'):combine([e],None,[],{})

if __name__=='__main__':unittest.main()
