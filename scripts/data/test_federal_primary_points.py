import copy
import json
import pathlib
import tempfile
import unittest

from backfill_provider_locations import sha
from stage_usgs_primary import SOURCES, dump, match_inventory, validate_page


def feature(oid=1, street='100 Main Street', city='Houston', x=-95.365, y=29.76, precision=1, source='usgs'):
    attributes = {'OBJECTID': oid, 'PERMANENT_IDENTIFIER': f'00000000-0000-0000-0000-{oid:012d}',
                  'ADDRESS': street, 'CITY': city, 'STATE': 'TX', 'ZIPCODE': '77002',
                  'NAME': 'Native structure', 'POINTLOCATIONTYPE': precision, 'LOADDATE': 1704067200000,
                  'FCODE': 74026, 'SOURCE_ORIGINATOR': 'USGS'}
    if source != 'usgs':
        attributes.update(ID=str(oid), ZIP='77002', GEOPREC='ONENTITY', GEODATE=1230768000000,
                          CONTDATE=1230768000000, FIPS='48201')
    return {'attributes': attributes, 'geometry': {'x': x, 'y': y}}


def target(city='Houston', county='48201'):
    address = {'street': '100 Main ST', 'city': city, 'state': 'TX', 'zip': '77002'}
    return {'key': 'FDID:TX:TEST', 'source': 'USFA', 'state': 'TX', 'address': address,
            'sourceCounty': county, 'status': 'no-match', 'match': None, 'countyFips': ''}


class FederalPrimaryPointsTest(unittest.TestCase):
    def replay(self, rows, entry=None, source='usgs'):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            raw = dump({'features': rows})
            (root / 'page.json').write_bytes(raw)
            inventory = {'source': source, 'sourceCount': len(rows), 'sourceSha256': 'a' * 64,
                         'collectionDate': '2026-11-26',
                         'pages': [{'file': 'page.json', 'sha256': sha(raw)}]}
            return match_inventory(root, inventory, [entry or target()], 'b' * 64)

    def test_exact_native_point_retains_source_date_and_precision(self):
        report = self.replay([feature()])
        self.assertEqual(report['outcomes']['accepted'], 1)
        candidate = report['candidates'][0]
        self.assertEqual(candidate['address'], target()['address'])
        self.assertEqual(candidate['match']['point']['sourceDate'], '2024-01-01')
        self.assertEqual(candidate['match']['point']['collectionDate'], '2026-11-26')
        self.assertEqual(candidate['match']['point']['precision'], 'structure-centroid')
        self.assertEqual(candidate['match']['point']['addressRole'], 'source-address-location')
        self.assertEqual(report['sourceStats']['coordinateAuditRowsScanned'], 1)

    def test_source_postal_alias_and_missing_city_preserved(self):
        for native_city in ['A Different Reported City', '']:
            with self.subTest(city=native_city):
                result = self.replay([feature(city=native_city)])['candidates'][0]
                self.assertEqual(result['match']['matchBasis'], 'normalized-street-state-zip')
                self.assertEqual(result['match']['sourceAddress']['city'], native_city)
                self.assertEqual(result['address']['city'], 'Houston')

    def test_global_coordinate_audit_includes_unmatched_other_address(self):
        report = self.replay([feature(), feature(2, street='200 Other Avenue')])
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['sourceStats']['coordinateAuditRowsScanned'], 2)
        self.assertEqual(report['rejected'][0]['reasons'], ['source-coordinate-shared-across-distinct-addresses'])

    def test_exact_address_disagreeing_points_withheld(self):
        report = self.replay([feature(), feature(2, x=-95.38)])
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['outcomes']['sourceCoordinateDisagreement'], 1)

    def test_coordinate_reuse_does_not_ignore_other_rows_missing_postal_fields(self):
        other = feature(2, street='200 Other Avenue', city='')
        other['attributes']['ZIPCODE'] = None
        report = self.replay([feature(), other])
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['outcomes']['sourceEvidenceConflict'], 1)

    def test_coordinate_reuse_distinguishes_identical_streets_in_other_postal_areas(self):
        other = feature(2, city='Another Town')
        other['attributes']['ZIPCODE'] = '77003'
        report = self.replay([feature(), other])
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['outcomes']['sourceEvidenceConflict'], 1)

    def test_primary_source_county_must_agree(self):
        report = self.replay([feature()], target(county='48001'))
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['outcomes']['primarySourceCountyDisagreement'], 1)
        self.assertEqual(report['rejected'][0]['reasons'], ['primary-source-county-disagreement'])
        self.assertEqual(report['rejected'][0]['pointCountyFips'], '48201')

    def test_unknown_and_approximate_usgs_locations_do_not_qualify(self):
        for precision in [0, 3, 4, None]:
            with self.subTest(precision=precision):
                self.assertEqual(self.replay([feature(precision=precision)])['candidates'], [])

    def test_historical_hifld_requires_native_precision_and_county(self):
        row = feature(source='hifld-ems')
        candidate = self.replay([row], source='hifld-ems')['candidates'][0]
        self.assertTrue(candidate['match']['point']['historicalFacilityEvidence'])
        self.assertEqual(candidate['match']['point']['sourceDate'], '2009-01-01')
        for field, value in [('GEOPREC', 'ZIPCENTROID'), ('FIPS', '48001')]:
            changed = copy.deepcopy(row)
            changed['attributes'][field] = value
            self.assertEqual(self.replay([changed], source='hifld-ems')['candidates'], [])

    def test_page_must_reconcile_to_native_inventory_and_wgs84(self):
        data = {'geometryType': 'esriGeometryPoint', 'spatialReference': {'wkid': 4326}, 'features': [feature()]}
        self.assertEqual(len(validate_page(dump(data), [1])), 1)
        with self.assertRaises(ValueError):
            validate_page(dump(data), [1, 2])
        changed = copy.deepcopy(data)
        changed['features'].append(feature())
        with self.assertRaises(ValueError):
            validate_page(dump(changed), [1])
        changed = copy.deepcopy(data)
        changed['exceededTransferLimit'] = True
        with self.assertRaises(ValueError):
            validate_page(dump(changed), [1])
        changed = copy.deepcopy(data)
        changed['spatialReference']['wkid'] = 3857
        with self.assertRaises(ValueError):
            validate_page(dump(changed), [1])


if __name__ == '__main__':
    unittest.main()
