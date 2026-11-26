import collections
import copy
import hashlib
import json
import unittest
import zipfile

from backfill_provider_locations import ROOT
from recover_nppes_primary_components_extended import (
    bucket, choose_location, nad_observation_endpoints,
    nad_rejected_observations, nad_rejection_class,
)


class NadQualificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = ROOT/'scripts/data/evidence/primary-nppes-components-extended/2026-11-26'
        with zipfile.ZipFile(directory/'original.zip') as archive:
            raw = archive.read('report.json')
        assert hashlib.sha256(raw).hexdigest() == '8c2f746a1d50e6a0f04b4ee092d1bea283331d2865d2564ac91729dd92e28614'
        cls.old = json.loads(raw)
        target_path = ROOT/'scripts/data/evidence/primary-nppes-native/2026-11-26/native-component-targets.json'
        raw = target_path.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == 'cac14a8230f8922fadd733308ab3aa7a161ba141e2593c70f3b7861018971305'
        cls.targets = {row['key']: row for row in json.loads(raw)}

    def test_unqualified_point_is_not_positive_conflict(self):
        self.assertEqual(nad_rejection_class({'reasons': ['unsupported-source-point']}), 'pointBlocks')

    def test_positive_native_lifecycle_and_county_reasons_still_veto(self):
        for reason in ('nonactive-lifecycle', 'native-source-county-disagreement',
                       'coordinate-reused-across-distinct-addresses', 'conflicting-native-points'):
            self.assertEqual(nad_rejection_class({'reasons': ['unsupported-source-point', reason]}), 'pointConflicts')

    def test_unknown_or_empty_reason_fails_closed(self):
        for reasons in ([], ['future-unreviewed-nad-reason']):
            with self.assertRaises(ValueError):
                nad_rejection_class({'reasons': reasons})

    def test_real_ten_cases_keep_all_five_eligible_native_endpoints(self):
        changed = []
        endpoint_count = 0
        for original in self.old['selectionDecisions']:
            rows = [row for row in original['pointConflicts']
                    if row['source'] == 'nad' and set(row['reasons']) == {'unsupported-source-point'}]
            if not rows:
                continue
            scope = copy.deepcopy(original)
            scope['qualifiedNadObservations'] = []
            scope['pointConflicts'] = [row for row in scope['pointConflicts'] if row not in rows]
            for row in rows:
                scope['pointBlocks'].append(copy.deepcopy(row))
                scope['qualifiedNadObservations'].extend(nad_rejected_observations(row['nativeRejection'], self.targets[original['key']]))
            endpoint_count += len(scope['qualifiedNadObservations'])
            witnesses = original['acceptedNativeWitnesses']+nad_observation_endpoints(scope['qualifiedNadObservations'])
            selected, reason = choose_location(scope, witnesses)
            changed.append((original['key'], reason, bool(selected)))
        self.assertEqual(len(changed), 10)
        self.assertEqual(endpoint_count, 5)
        self.assertEqual(sum(accepted for _, _, accepted in changed), 3)
        self.assertEqual(collections.Counter(reason for _, reason, _ in changed), {
            'native-component-address-point': 3,
            'qualified-native-source-conflict': 3,
            'incomplete-or-unqualified-native-point-source': 2,
            'qualified-source-coordinate-disagreement': 1,
            'qualified-point-without-selectable-profile': 1,
        })

    def test_nonselectable_native_point_cannot_enable_range_fallback(self):
        scope = bucket()
        scope['pointBlocks'] = [{'reason': 'unsupported-source-point'}]
        scope['qualifiedNadObservations'] = [{'selectable': False}]
        scope['rangeObservations'] = [{'source': 'tiger'}]
        witnesses = [{'method': 'nad-address-point', 'latitude': 40, 'longitude': -75, 'countyFips': '36001'}]
        self.assertEqual(choose_location(scope, witnesses), (None, 'qualified-point-without-selectable-profile'))

    def test_nonselectable_native_endpoints_are_compared_with_each_other(self):
        scope = bucket()
        scope['pointBlocks'] = [{'reason': 'unsupported-source-point'}]
        scope['qualifiedNadObservations'] = [{'selectable': False}, {'selectable': False}]
        witnesses = [{'method': 'nad-address-point', 'latitude': y, 'longitude': -75, 'countyFips': '36001'}
                     for y in (40, 40.002)]
        self.assertEqual(choose_location(scope, witnesses), (None, 'qualified-source-coordinate-disagreement'))

    def test_retained_endpoint_cannot_move_away_from_native_proof(self):
        for decision in self.old['selectionDecisions']:
            for row in decision['pointConflicts']:
                if row['source'] != 'nad' or set(row['reasons']) != {'unsupported-source-point'}:
                    continue
                native = copy.deepcopy(row['nativeRejection'])
                if not native['eligibleNativePoints']:
                    continue
                native['eligibleNativePoints'][0]['latitude'] += 0.01
                with self.assertRaises(ValueError):
                    nad_rejected_observations(native, self.targets[decision['key']])
                return
        self.fail('The pinned real cases must contain an eligible native NAD endpoint')


if __name__ == '__main__':
    unittest.main()
