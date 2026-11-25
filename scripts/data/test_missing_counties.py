import unittest
from research_missing_counties import build_report
class CountyRecoveryTests(unittest.TestCase):
    def test_exact_peer_only_no_coordinates_or_assignment(self):
        a={'street':'123 Main Street','city':'Example','state':'TX','zip':'75001'}
        e={'key':'NPI:fixture','source':'NPPES','state':'TX','name':'Fixture','sourceDate':'2026-11-25','address':a,'status':'no-match','match':None,'sourceCounty':'','countyFips':''}
        p={**e,'key':'FDID:TX:fixture','source':'USFA','sourceCounty':'48085','countyFips':'48085','status':'mapped','match':{'method':'regional-address-point','point':{'countyFips':'48085','objectId':17},'latitude':33,'longitude':-96}}
        fips={'48085':'TX','48121':'TX','39049':'OH'}
        def result(*peers):return build_report([e,*peers],fips)['rows'][0]
        row=result(p);self.assertEqual(row['countyCandidate'],'48085');self.assertEqual(row['status'],'exact_address_point_research');self.assertFalse(row['publicationEligible']);self.assertNotIn('latitude',row);self.assertNotIn('latitude',row['evidence'][0]);self.assertEqual(e['sourceCounty'],'')
        self.assertEqual(result({**p,'source':'NPPES'})['status'],'no_independent_source_evidence')
        self.assertEqual(result({**p,'address':{**a,'street':'123 Main Street STE 2'}})['status'],'no_county_evidence')
        self.assertEqual(result({**p,'address':{**a,'street':'124 Main Street'}})['status'],'no_county_evidence')
        self.assertEqual(result(p,{**p,'key':'conflict','sourceCounty':'48121'})['status'],'conflicting_county_evidence')
        self.assertEqual(result({**p,'countyFips':'39049'})['status'],'conflicting_county_evidence')
        self.assertEqual(result({**p,'match':{'method':'census-address-range'}})['status'],'exact_registry_address_research')
        self.assertEqual(result({**p,'status':'historical'})['status'],'no_independent_source_evidence')
        with self.assertRaises(ValueError):build_report([e,e],fips)
