import collections
import copy
import unittest
from unittest.mock import patch
from recover_neris_grid_points import is_grid_address, native_component, source_records, select
from address_normalization import normalize_street, source_street_line
from test_neris_primary_rebuilt import department, primary

BOUNDARIES = {'WI': [('55101', (-88, 30, -85, 35), [[[-88, 30], [-85, 30], [-85, 35], [-88, 35], [-88, 30]]])]}

def dept(oid=1, street='N123W456 Main Street', latitude=32.5):
    d = department('FD5500100'+str(oid), street); d['oid'] = oid; d['state'] = 'WI'
    d['address'][3] = 'WI'; d['address'][4] = '53001'; d['coordinates'] = [latitude, -86.5]
    return d

def entry():
    e = primary('FDID:WI:1', 'N123W456 Main St'); e.update(state='WI', sourceCounty='55101')
    e['address'].update(state='WI', zip='53001')
    return e

def choose(departments, target=None):
    rows, _ = source_records(departments, BOUNDARIES); index = collections.defaultdict(list)
    for row in rows:
        a = row['address']; index[(a['state'], normalize_street(source_street_line(a['street'])), a['zip'])].append(row)
    return select(target or entry(), index)

class NativeGridTests(unittest.TestCase):
    def test_unchanged_native_house_token_is_preserved(self):
        candidate, reason, _ = choose([dept()])
        self.assertIsNone(reason); self.assertEqual(candidate['match']['sourceAddress']['street'], 'N123W456 Main Street')
        self.assertEqual(candidate['match']['sourceAddressProfile'], 'wi-mi-directional-grid-house-number')
        self.assertEqual(candidate['match']['point']['coordinatesAsReported'], [32.5, -86.5])

    def test_profile_is_limited_to_explicit_wi_mi_syntax(self):
        e = entry()['address']; self.assertTrue(is_grid_address(e))
        for state in ('AL', 'NY'):
            self.assertFalse(is_grid_address({**e, 'state': state}))
        for street in ('123 Main St', 'N123-W456 Main St', 'N 123 Main St', 'N123W456'):
            self.assertFalse(is_grid_address({**e, 'street': street}))

    def test_house_token_is_never_rewritten_to_numeric_house(self):
        self.assertIsNone(choose([dept(street='123 Main Street')])[0])
        self.assertIsNone(choose([dept(street='N123W457 Main Street')])[0])

    def test_numeric_native_addresses_participate_in_reuse_audit(self):
        self.assertEqual(choose([dept(), dept(2, '789 Other Road')])[1], 'native-grid-coordinate-or-address-conflict')

    def test_different_known_postal_codes_at_identical_coordinate_conflict(self):
        other = dept(2); other['address'][4] = '53002'
        self.assertEqual(choose([dept(), other])[1], 'native-grid-coordinate-or-address-conflict')

    def test_complete_all_pairs_cannot_hide_wide_endpoints(self):
        self.assertEqual(choose([dept(), dept(2, latitude=32.4994), dept(3, latitude=32.5006)])[1], 'native-grid-coordinate-disagreement')

    def test_source_county_is_a_veto(self):
        e = entry(); e['sourceCounty'] = '55001'
        self.assertEqual(choose([dept()], e)[1], 'native-grid-source-county-disagreement')

    def test_numeric_targets_see_distinct_grid_address_reuse_without_changing_core_report(self):
        from retain_neris_grid_points import grid_aware_native_reuse_vetoes
        numeric = dept(1, '123 Main Street'); grid = dept(2, 'N123W456 Other Road')
        records, _ = source_records([numeric, grid], BOUNDARIES); index = collections.defaultdict(list)
        for row in records:
            a = row['address']; index[(a['state'], normalize_street(source_street_line(a['street'])))].append(row)
        a = {**entry()['address'], 'street': '123 Main Street'}
        with patch('retain_neris_grid_points._grid_complete_index', return_value=index):
            self.assertEqual(grid_aware_native_reuse_vetoes(a), ['coordinate-reused-across-distinct-addresses'])

    def test_exact_native_city_is_required(self):
        d = dept(); d['address'][2] = 'Different City'
        self.assertEqual(choose([d])[1], 'no-exact-native-grid-city')

    def test_native_secondary_physical_lines_are_not_silently_dropped(self):
        parts = ['N123W456 Main St', 'N987W654 Other St', 'Springfield', 'WI', '53001']
        self.assertTrue(native_component(parts)[2])
        parts[1] = 'PO BOX 7'
        address, component, conflict = native_component(parts)
        self.assertFalse(conflict); self.assertEqual(address['street'], 'N123W456 Main St')
        self.assertEqual(component['otherLineKind'], 'mailing-address')

if __name__ == '__main__':
    unittest.main()
