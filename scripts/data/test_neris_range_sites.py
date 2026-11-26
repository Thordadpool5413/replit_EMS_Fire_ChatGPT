import copy
import types
import unittest
from unittest.mock import patch
import recover_neris_range_sites as ranges
from recover_neris_primary import dump
from backfill_provider_locations import sha

class NerisRangeFallbackTests(unittest.TestCase):
    def setUp(self):
        self.address = {'street': '12 Main St', 'city': 'Town', 'state': 'AL', 'zip': '36003'}
        self.original = {'key': 'FDID:AL:1', 'source': 'USFA', 'state': 'AL', 'sourceCounty': '01001',
                         'address': {'street': 'PO Box 1', 'city': 'Town', 'state': 'AL', 'zip': '36003'},
                         'status': 'not-eligible'}
        self.target = {**copy.deepcopy(self.original), 'key': 'FDID:AL:1@NERIS-HQ',
                       'originalPrimaryKey': self.original['key'], 'address': self.address,
                       'primaryAddressEvidence': {'method': 'neris-department-geocoded-site-correlation',
                           'diagnosticOnly': True, 'site': {'id': 'native-hq'}, 'siteRole': 'reported-headquarters'}}
        self.targets = [self.target]
        self.point_report = {'targetVariantsSha256': sha(dump(self.targets)), 'withheld': []}
        self.reports = {source: {} for source in ('usgs', 'hifld-ems', 'hifld-fire', 'nad')}
        self.summaries = {source: {'reportSha256': source+'-digest'} for source in self.reports}
        self.native = {'object': {'id': 'native-hq', 'oid': 7, 'address': ['12 Main St', '', 'Town', 'AL', '36003']},
                       'kind': 'department', 'coordinates': [None, None], 'withheldReason': 'no-source-coordinate',
                       'countyFips': None}
        self.tiger = {'scope': 'neris-native', 'key': self.target['key'],
                      'targetId': 'neris-native:'+self.target['key'],
                      'diagnosticInput': copy.deepcopy(self.target), 'address': self.address,
                      'originalAddress': self.address, 'countyFips': '01001',
                      'match': {'method': 'tiger-address-range', 'latitude': 32.5, 'longitude': -86.5,
                                'point': {'precision': 'address-range', 'countyFips': '01001'}}}

    def run_selection(self, observed=None, vetoes=None, native_issues=None, validates=True):
        module = types.SimpleNamespace(validate_tiger_diagnostic_candidate=lambda candidate: validates)
        with patch.dict('sys.modules', {'retain_tiger_primary': module}), \
             patch.object(ranges, 'load_departments', return_value=[]), \
             patch.object(ranges, 'native_index', return_value={}), \
             patch.object(ranges, 'matching_records', return_value=[(self.native, 'normalized-street-city-state-zip')]), \
             patch.object(ranges, 'native_vetoes', return_value=native_issues or []), \
             patch.object(ranges, 'collect_observations', return_value=(observed or {}, vetoes or {}, self.summaries)):
            return ranges.generate('core', self.targets, {'entries': [self.original]}, self.reports,
                                   self.point_report, {'diagnosticCandidates': [self.tiger]})

    def test_range_keeps_inferred_identity_and_truthful_road_precision(self):
        report = self.run_selection()
        proof = report['candidates'][0]['primaryAddressEvidence']
        self.assertEqual(proof['method'], ranges.CORE_METHOD)
        self.assertEqual(proof['rangeGeocoding']['geometryRole'], 'interpolated-road-location')
        self.assertEqual(proof['rangeGeocoding']['precision'], 'address-range')
        self.assertEqual(report['candidates'][0]['originalAddress'], self.original['address'])
        self.assertFalse(proof['rangeGeocoding']['nativeCoordinatesUsed'])

    def test_qualified_independent_point_blocks_range_fallback(self):
        report = self.run_selection(observed={self.target['key']: [{'source': 'usgs'}]})
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['outcomes']['qualified-address-point-available'], 1)

    def test_qualified_negative_point_blocks_range_fallback(self):
        report = self.run_selection(vetoes={self.target['key']: [
            {'source': 'nad', 'reasons': ['nonactive-lifecycle']}]})
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['rejected'][0]['sourceConflicts'][0]['source'], 'nad')

    def test_native_qualified_point_blocks_range_fallback(self):
        self.native.update(withheldReason=None, coordinates=[32.5, -86.5], countyFips='01001')
        self.assertEqual(self.run_selection()['candidates'], [])

    def test_native_reuse_conflict_blocks_range_fallback(self):
        self.assertEqual(self.run_selection(native_issues=[
            {'reason': 'coordinate-reused-across-distinct-addresses'}])['candidates'], [])

    def test_existing_complete_point_consensus_conflict_blocks_range(self):
        self.point_report['withheld'] = [{'key': self.target['key'], 'reason': 'independent-coordinate-disagreement'}]
        self.assertEqual(self.run_selection()['candidates'], [])

    def test_changed_native_target_proof_cannot_reuse_a_range_candidate(self):
        self.tiger['diagnosticInput']['primaryAddressEvidence']['site']['id'] = 'different-native-id'
        with self.assertRaisesRegex(ValueError, 'exactly bound'):
            self.run_selection()

    def test_native_range_replay_must_succeed(self):
        with self.assertRaisesRegex(ValueError, 'exactly bound'):
            self.run_selection(validates=False)

if __name__ == '__main__':
    unittest.main()
