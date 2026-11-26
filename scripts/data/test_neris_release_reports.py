import copy
import unittest
from unittest.mock import patch
from neris_release_reports import bind_native_rejection, split_grid_rejection, expand_range_negative

class NativeNegativeBindingTests(unittest.TestCase):
    def setUp(self):
        self.original = {'key': 'FDID:WI:1', 'address': {'street': 'PO Box 1', 'city': 'Town', 'state': 'WI', 'zip': '53001'}}
        self.address = {'street': '12 Main St', 'city': 'Town', 'state': 'WI', 'zip': '53001'}
        self.department = {'id': 'native-hq', 'reportedStationCount': 0, 'stations': []}
        self.record = {'object': {'id': 'native-hq', 'oid': 7,
                        'address': ['12 Main St', '', 'Town', 'WI', '53001']},
                       'kind': 'department', 'address': self.address, 'addressComponent': {'sourceField': 'line1'},
                       'coordinates': [44.0, -89.0], 'withheldReason': None}
        self.objects = {'native-hq': self.record}
        self.row = {'key': self.original['key'], 'reason': 'site-source-county-disagreement',
                    'nativeDepartmentId': 'native-hq'}
        self.target = {'key': self.original['key']+'@NERIS-MAILING-HQ',
                       'originalPrimaryKey': self.original['key'], 'address': self.address}

    def test_negative_binds_native_physical_query_not_original_mailing_address(self):
        with patch('neris_release_reports.site_selection', return_value=(None, self.row['reason'])):
            bound = bind_native_rejection(self.row, self.original, self.department, self.objects, {}, self.target)
        self.assertEqual(bound['targetAddress'], self.address)
        self.assertNotEqual(bound['targetAddress'], self.original['address'])
        self.assertEqual(bound['releaseAddressBinding']['nativeObjectId'], 7)
        self.assertNotIn('targetAddress', self.row)

    def test_changed_frozen_target_is_rejected(self):
        target = copy.deepcopy(self.target); target['address']['street'] = '999 Other St'
        with patch('neris_release_reports.site_selection', return_value=(None, self.row['reason'])):
            with self.assertRaisesRegex(ValueError, 'actual native site query'):
                bind_native_rejection(self.row, self.original, self.department, self.objects, {}, target)

    def test_reason_must_replay_from_source(self):
        with patch('neris_release_reports.site_selection', return_value=(None, 'site-no-source-coordinate')):
            with self.assertRaisesRegex(ValueError, 'unchanged source selector'):
                bind_native_rejection(self.row, self.original, self.department, self.objects, {}, self.target)

    def test_qualified_conflict_cannot_invent_a_site(self):
        self.record['address'] = self.original['address']
        with patch('neris_release_reports.site_selection', return_value=(None, self.row['reason'])):
            with self.assertRaisesRegex(ValueError, 'actual queried physical site'):
                bind_native_rejection(self.row, self.original, self.department, self.objects, {})

    def test_ambiguous_grid_lines_are_not_qualified_reuse_by_themselves(self):
        self.record['coordinates'] = [None, None]
        self.record['withheldReason'] = 'conflicting-native-address-lines'
        row = {'key': self.original['key'], 'reason': 'native-grid-coordinate-or-address-conflict'}
        result = split_grid_rejection(row, [self.record])
        self.assertEqual(result['reasons'], ['conflicting-native-address-lines'])
        self.assertEqual(result['retainedReason'], row['reason'])
        self.assertNotEqual(result['reason'], row['reason'])

    def test_actual_grid_reuse_retains_qualified_reason(self):
        self.record['withheldReason'] = 'coordinate-reused-across-distinct-addresses'
        row = {'key': self.original['key'], 'reason': 'native-grid-coordinate-or-address-conflict'}
        result = split_grid_rejection(row, [self.record])
        self.assertEqual(result['reasons'], ['coordinate-reused-across-distinct-addresses'])
        self.assertEqual(result['nativeConflictWitnesses'][0]['nativeCoordinatesAsReported'], [44.0, -89.0])

    def test_range_does_not_hide_native_or_independent_point_conflict(self):
        raw = {'sourceConflicts': [], 'nativeConflicts': [{'reason': 'native-source-county-disagreement'}],
               'pointSelectionConflict': {'reason': 'independent-coordinate-disagreement'}}
        result = expand_range_negative(raw)
        self.assertEqual({row['reason'] for row in result['sourceConflicts']},
                         {'native-source-county-disagreement', 'independent-coordinate-disagreement'})
        self.assertEqual(raw['sourceConflicts'], [])

if __name__ == '__main__':
    unittest.main()
