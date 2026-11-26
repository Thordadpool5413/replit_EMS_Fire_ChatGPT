import copy
import unittest

from recover_neris_primary import generate_candidates, identity_name


BOUNDARIES = {'AL': [('01001', (-88, 30, -85, 35), [[[-88, 30], [-85, 30], [-85, 35], [-88, 35], [-88, 30]]])]}


def primary(key='FDID:AL:1', street='PO BOX 7'):
    return {'key': key, 'name': 'Springfield Volunteer Fire Department', 'state': 'AL',
            'source': 'USFA', 'sourceDate': '2026-11-17',
            'address': {'street': street, 'city': 'Springfield', 'state': 'AL', 'zip': '36001'},
            'status': 'not-eligible' if street.startswith('PO') else 'no-match',
            'match': None, 'sourceCounty': '01001', 'countyFips': ''}


def department(native_id='FD01001001', street='123 Main Street'):
    return {'id': native_id, 'name': 'Springfield Volunteer Fire Department', 'state': 'AL',
            'oid': 1, 'address': [street, None, 'Springfield', 'AL', '36001'],
            'coordinates': [32.5, -86.5], 'reportedStationCount': 1, 'stations': []}


def native(entry):
    return ['usfa:AL:'+entry['key'].split(':')[-1], 'USFA', entry['name'], 'AL', 'Springfield', '36001', '01001', 'Autauga', 'source-county', '', entry['address']['street'], '']


def run(entries, departments):
    return generate_candidates(entries, departments, [native(e) for e in entries], BOUNDARIES)


class NerisPrimaryTests(unittest.TestCase):
    def test_explicit_hq_association_preserves_original(self):
        e = primary()
        report = run([e], [department()])
        c = report['candidates'][0]
        self.assertEqual(c['address']['street'], '123 Main Street')
        self.assertEqual(c['originalAddress']['street'], 'PO BOX 7')
        self.assertEqual(c['primaryAddressEvidence']['siteRole'], 'reported-headquarters')
        self.assertTrue(c['primaryAddressEvidence']['endUserValidationRequired'])
        self.assertEqual(e['status'], 'not-eligible')

    def test_reciprocal_native_and_primary_ambiguity_rejected(self):
        e = primary()
        d = department()
        d2 = department('FD01001002')
        self.assertEqual(run([e], [d, d2])['candidates'], [])
        self.assertEqual(run([e, primary('FDID:AL:2')], [d])['candidates'], [])

    def test_source_county_veto(self):
        e = primary()
        e['sourceCounty'] = '01003'
        self.assertEqual(run([e], [department()])['candidates'], [])

    def test_shared_coordinate_distinct_address_veto(self):
        d = department()
        other = department('FD01001002', '456 Other Road')
        other['name'] = 'Another Fire Department'
        self.assertEqual(run([primary()], [d, other])['candidates'], [])

    def test_shared_coordinate_distinct_known_zips_veto(self):
        d = department()
        other = department('FD01001002')
        other['address'][4] = '36002'
        self.assertEqual(run([primary(street='123 Main St')], [d, other])['candidates'], [])

    def test_shared_coordinate_city_alias_same_zip_is_not_distinct_building(self):
        d = department()
        other = department('FD01001002')
        other['address'][2] = 'Postal Township'
        c = run([primary(street='123 Main St')], [d, other])['candidates'][0]
        self.assertEqual(len(c['corroboratingNativeIds']), 2)

    def test_sole_station_requires_reported_and_observed_one(self):
        d = department(street='PO BOX 7')
        d['stations'] = [{'id': d['id']+'S001', 'parentId': d['id'], 'oid': 2,
                          'name': d['name'], 'address': ['123 Main Street', None, 'Springfield', 'AL', '36001'],
                          'coordinates': [32.5, -86.5], 'parentNameConflict': False}]
        c = run([primary()], [d])['candidates'][0]
        self.assertEqual(c['primaryAddressEvidence']['siteRole'], 'sole-reported-station')
        d['reportedStationCount'] = 2
        self.assertEqual(run([primary()], [d])['candidates'], [])

    def test_direct_address_and_city_variant_keep_actual_source(self):
        e = primary(street='123 Main St')
        d = department()
        d['address'][2] = 'Postal Township'
        c = run([e], [d])['candidates'][0]
        self.assertNotIn('primaryAddressEvidence', c)
        self.assertEqual(c['match']['matchBasis'], 'normalized-street-state-zip')
        self.assertEqual(c['match']['sourceAddress']['city'], 'Postal Township')
        self.assertEqual(c['address']['city'], 'Springfield')

    def test_native_coordinate_disagreement_not_selected_around(self):
        e = primary(street='123 Main St')
        d = department()
        d2 = department('FD01001002')
        d2['coordinates'] = [32.55, -86.5]
        self.assertEqual(run([e], [d, d2])['candidates'], [])

    def test_all_pairs_prevents_middle_point_hiding_wide_source_spread(self):
        e = primary(street='123 Main St')
        middle = department('FD01001001')
        south = department('FD01001002')
        north = department('FD01001003')
        south['coordinates'] = [32.4994, -86.5]
        north['coordinates'] = [32.5006, -86.5]
        self.assertEqual(run([e], [middle, south, north])['candidates'], [])

    def test_exact_zip_precedes_same_city_different_zip(self):
        e = primary(street='123 Main St')
        d = department()
        other = department('FD01001002')
        other['address'][4] = '36002'
        other['coordinates'] = [32.55, -86.5]
        c = run([e], [d, other])['candidates'][0]
        self.assertEqual(c['match']['point']['nativeId'], d['id'])
        self.assertEqual(c['match']['matchBasis'], 'normalized-street-city-state-zip')

    def test_withheld_exact_zip_cannot_fall_back_to_other_zip(self):
        e = primary(street='123 Main St')
        d = department()
        d['coordinates'] = None
        other = department('FD01001002')
        other['address'][4] = '36002'
        other['coordinates'] = [32.55, -86.5]
        self.assertEqual(run([e], [d, other])['candidates'], [])

    def test_association_cannot_bypass_selected_site_conflict(self):
        e = primary()
        d = department()
        other = department('FD01001002')
        other['name'] = 'Other Fire Department'
        other['coordinates'] = [32.55, -86.5]
        self.assertEqual(run([e], [d, other])['candidates'], [])

    def test_physical_hq_with_mailbox_second_line_is_hq(self):
        d = department()
        d['address'][1] = 'PO BOX 7'
        c = run([primary()], [d])['candidates'][0]
        self.assertEqual(c['primaryAddressEvidence']['siteRole'], 'reported-headquarters')
        self.assertEqual(c['match']['point']['addressComponent']['otherLineKind'], 'mailing-address')
        self.assertEqual(c['match']['point']['addressAsReported'][1], 'PO BOX 7')

    def test_distinct_physical_native_lines_withheld(self):
        d = department()
        d['address'][1] = '456 Other Street'
        self.assertEqual(run([primary()], [d])['candidates'], [])

    def test_physical_native_second_line_is_explicit(self):
        d = department(street='PO BOX 7')
        d['address'][1] = '123 Main Street'
        c = run([primary()], [d])['candidates'][0]
        self.assertEqual(c['primaryAddressEvidence']['siteRole'], 'reported-headquarters')
        self.assertEqual(c['match']['point']['addressComponent']['sourceField'], 'line2')

    def test_existing_neris_point_is_audited(self):
        e = primary(street='123 Main St')
        e.update(status='mapped', countyFips='01001', match={'method': 'neris-reported-address', 'latitude': 33.0, 'longitude': -86.5})
        audit = run([e], [department()])['legacyAudit'][0]
        self.assertFalse(audit['accepted'])
        self.assertEqual(audit['reason'], 'legacy-point-disagrees-with-native-address')

    def test_supported_legacy_coordinate_never_snaps_to_nearby_source_point(self):
        e = primary(street='123 Main St')
        e.update(status='mapped', countyFips='01001', match={'method': 'neris-reported-address', 'latitude': 32.5001, 'longitude': -86.5, 'point': {'nativeId': 'FD01001002'}})
        d, second = department(), department('FD01001002')
        second['coordinates'] = [32.5001, -86.5]
        audit = run([e], [d, second])['legacyAudit'][0]
        self.assertTrue(audit['accepted'])
        self.assertEqual(audit['candidate']['match']['latitude'], 32.5001)
        self.assertTrue(audit['coordinatePreserved'])

    def test_unbacked_nearby_legacy_coordinate_is_withheld(self):
        e = primary(street='123 Main St')
        e.update(status='mapped', countyFips='01001', match={'method': 'neris-reported-address', 'latitude': 32.5001, 'longitude': -86.5})
        audit = run([e], [department()])['legacyAudit'][0]
        self.assertFalse(audit['accepted'])
        self.assertEqual(audit['reason'], 'legacy-point-not-in-complete-native-address-evidence')

    def test_full_name_modifiers_preserved(self):
        self.assertEqual(identity_name('Springfield Vol. Fire Dept.'), 'SPRINGFIELD VOLUNTEER FIRE DEPARTMENT')
        self.assertNotEqual(identity_name('North Springfield Fire Department'), identity_name('Springfield Fire Department'))
        self.assertNotEqual(identity_name('Springfield Fire Department 2'), identity_name('Springfield Fire Department'))


if __name__ == '__main__':
    unittest.main()
