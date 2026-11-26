import unittest
from retain_usfa_station_catalog import station_address_key,name_city_zip,candidate_rows
class StationComparisonTests(unittest.TestCase):
    def test_full_street_address_state_unit_and_zip(self):
        a=['123 Main Street','STE 2','Example','TX','75001-1234']
        self.assertEqual(station_address_key(a),station_address_key(['123 MAIN ST','STE 2','EXAMPLE','TX','75001 1234']))
        self.assertNotEqual(station_address_key(a),station_address_key(['123 Main St',None,'Example','TX','75001']))
        self.assertNotEqual(station_address_key(a),station_address_key(['123 Main St','STE 2','Example','FL','75001']))
        self.assertIsNone(station_address_key(['PO BOX 3',None,'Example','TX','75001']))
        self.assertNotEqual(name_city_zip('Department','A','TX','75001'),name_city_zip('Department','B','TX','75001'))
    def test_address_candidate_is_not_identity(self):
        r={'addressLine1AsReported':'123 Main St','addressLine2AsReported':None,'cityAsReported':'Example','stationState':'TX','postalCodeAsReported':'75001'}
        key=station_address_key(['123 Main St',None,'Example','TX','75001'])
        s=[{'id':'S1','parentId':'D1'},{'id':'S2','parentId':'D2'}]
        self.assertEqual([x['parentNameCityZipCorroborated'] for x in candidate_rows(r,[{'id':'D1'}],{key:s})],[True,False])
