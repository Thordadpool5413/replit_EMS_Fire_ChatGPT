import collections
import copy
import unittest
from unittest.mock import patch

import recover_neris_geocoded_sites as geocoded
from recover_neris_primary import source_objects
from test_neris_primary_rebuilt import BOUNDARIES, department, primary, run


class NerisIndependentSiteTests(unittest.TestCase):
    def setUp(self):
        self.original = primary()
        self.department = department()
        candidate = run([self.original], [self.department])['candidates'][0]
        proof = copy.deepcopy(candidate['primaryAddressEvidence'])
        proof.update(method=geocoded.METHOD, diagnosticOnly=True, originalMappingWithheld=False)
        self.target = {**copy.deepcopy(self.original), 'key': self.original['key']+'@NERIS-HQ',
                       'originalPrimaryKey': self.original['key'], 'status': 'no-match',
                       'address': candidate['address'], 'primaryAddressEvidence': proof}
        self.inputs = {'entries': [self.original]}
        self.candidate = candidate

    def report(self, source='usgs', coordinate=(32.5, -86.5), reasons=None):
        match = copy.deepcopy(self.candidate['match'])
        match.update(method=geocoded.SOURCE_METHODS[source], latitude=coordinate[0], longitude=coordinate[1])
        match['point'].update(precision='rooftop', objectId=5)
        candidate = {'key': self.target['key'], 'source': 'USFA', 'state': 'AL',
                     'address': copy.deepcopy(self.target['address']),
                     'originalAddress': copy.deepcopy(self.target['address']),
                     'countyFips': '01001', 'match': match}
        count = geocoded.FEDERAL_COUNTS[source]
        return {'source': source, 'baselineIndexSha256': geocoded.TARGET_SHA,
                'sourceStats': {'completeRowsScanned': count, 'coordinateAuditRowsScanned': count},
                'candidates': [] if reasons else [candidate],
                'rejected': [{'key': self.target['key'], 'reasons': reasons}] if reasons else []}

    def generate(self, reports):
        records, _ = source_objects([self.department], BOUNDARIES)
        index = collections.defaultdict(list)
        for record in records:
            address = record['address']
            index[(address['state'], geocoded.normalize_street(address['street']))].append(record)
        with patch.object(geocoded, 'native_index', return_value=index), patch.object(geocoded, 'point_witnesses', side_effect=lambda match, address: [{'method': match['method'], 'latitude': match['latitude'], 'longitude': match['longitude'], 'countyFips': match['point']['countyFips'], 'nativeId': str(match['point']['objectId'])}]):
            return geocoded.generate([self.target], self.inputs, reports, [self.department])

    def test_external_geocode_preserves_inferred_identity_and_invalid_native_discrepancy(self):
        self.department['coordinates'] = [31.0, -90.0]
        self.target['primaryAddressEvidence']['site']['coordinatesAsReported'] = [31.0, -90.0]
        self.target['primaryAddressEvidence']['department']['coordinatesAsReported'] = [31.0, -90.0]
        result = self.generate({'usgs': self.report(coordinate=(32.5, -86.5))})
        candidate = result['candidates'][0]
        proof = candidate['primaryAddressEvidence']
        self.assertEqual(candidate['originalAddress'], self.original['address'])
        self.assertEqual(proof['site']['coordinatesAsReported'], [31.0, -90.0])
        self.assertEqual(candidate['match']['latitude'], 32.5)
        self.assertFalse(proof['geocoding']['nativeCoordinatesUsed'])
        self.assertGreater(proof['geocoding']['nativeNerisObservations'][0]['distanceToSelectedMeters'], 1000)
        self.assertEqual(proof['siteRole'], 'reported-headquarters')
        self.assertNotIn('diagnosticOnly', proof)
        self.assertEqual(self.original['status'], 'not-eligible')

    def test_all_pairs_external_consensus_cannot_hide_wide_endpoints(self):
        result = self.generate({'usgs': self.report(),
                                'hifld-ems': self.report('hifld-ems', (32.4994, -86.5)),
                                'hifld-fire': self.report('hifld-fire', (32.5006, -86.5))})
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['withheld'][0]['reason'], 'independent-coordinate-disagreement')

    def test_original_source_county_conflict_vetoes_another_source(self):
        result = self.generate({'usgs': self.report(),
                                'hifld-fire': self.report('hifld-fire', reasons=['primary-source-county-disagreement'])})
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['withheld'][0]['reason'], 'valid-independent-source-conflict')

    def test_valid_native_coordinate_conflict_vetoes_another_source(self):
        result = self.generate({'usgs': self.report(),
                                'hifld-fire': self.report('hifld-fire', reasons=['independent-source-rows-disagree'])})
        self.assertEqual(result['candidates'], [])

    def test_retired_source_address_vetoes_other_point(self):
        # Selection handles this reason after NAD's separate source-edition
        # gate has established the native lifecycle status from its raw row.
        with patch.object(geocoded, 'source_rows', side_effect=lambda source, report, *args: report['candidates']):
            result = self.generate({'usgs': self.report(), 'nad': {
                'candidates': [], 'rejected': [{'key': self.target['key'], 'reasons': ['nonactive-lifecycle']}]}})
        self.assertEqual(result['candidates'], [])

    def test_unsupported_precision_is_not_contradictory_evidence(self):
        result = self.generate({'usgs': self.report(),
                                'hifld-fire': self.report('hifld-fire', reasons=['unsupported-native-precision'])})
        self.assertEqual(len(result['candidates']), 1)
        self.assertEqual(len(result['candidates'][0]['primaryAddressEvidence']['geocoding']['sourceObservations']), 1)

    def test_distinct_address_coordinate_reuse_is_qualified_veto(self):
        result = self.generate({'usgs': self.report(),
                                'hifld-fire': self.report('hifld-fire', reasons=['source-coordinate-shared-across-distinct-addresses'])})
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['consensusVetoes'][0]['originalPrimaryKey'], self.original['key'])

    def test_qualified_native_point_disagreement_is_not_ignored(self):
        result = self.generate({'usgs': self.report(coordinate=(32.51, -86.5))})
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['withheld'][0]['reason'], 'independent-coordinate-disagreement')

    def test_point_cannot_change_frozen_native_address(self):
        report = self.report()
        report['candidates'][0]['match']['sourceAddress']['street'] = '999 Main Street'
        with self.assertRaises(ValueError):
            self.generate({'usgs': report})

    def test_incomplete_inventory_cannot_supply_usable_point(self):
        report = self.report()
        report['sourceStats']['coordinateAuditRowsScanned'] -= 1
        with self.assertRaises(ValueError):
            self.generate({'usgs': report})

    def test_partial_sources_remain_diagnostic_and_cannot_be_retained(self):
        result = self.generate({'usgs': self.report()})
        self.assertFalse(result['completeRequiredSources'])
        from retain_neris_geocoded_sites import replay_all
        with self.assertRaisesRegex(ValueError, 'Every required independent source'):
            replay_all([self.target], self.inputs, {'usgs': self.report()}, result)


if __name__ == '__main__':
    unittest.main()
