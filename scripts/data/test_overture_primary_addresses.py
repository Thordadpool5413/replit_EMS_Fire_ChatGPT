import unittest

from match_overture_primary_addresses import (
    coordinate_key, distinct_fingerprints, matching_targets, native_street_fingerprint, points_agree,
    source_address, source_block_reason, target_indexes, wkb_point,
)


class OvertureSourceGuards(unittest.TestCase):
    def test_nad_wrapper_does_not_bypass_native_lifecycle(self):
        for label in ('nad', 'National Address Database', 'usdot'):
            self.assertEqual(source_block_reason({'sources':[{'provider':label,'license':'CC0-1.0'}]}),
                             'native-nad-status-not-retained')
        self.assertIsNone(source_block_reason({'sources':[{'provider':'open_addresses','dataset':'us/az/pima','license':None}]}))
        self.assertEqual(source_block_reason({'sources':[{'provider':'open_addresses','license':'CC-BY-NC-4.0'}]}),
                         'explicit-reuse-restriction')

    def test_preserves_postal_city_and_requires_native_state(self):
        row={'number':'716','street':'East County Road','postcode':'47394','postal_city':'Ridgeville',
             'address_levels':[{'value':'Indiana'},{'value':'Winchester'}]}
        self.assertEqual(source_address(row),{'street':'716 East County Road','city':'Ridgeville','state':'IN','zip':'47394'})
        row['address_levels'][0]['value']=None
        self.assertIsNone(source_address(row))

    def test_blank_source_postcode_is_an_explicit_different_basis(self):
        target={'key':'unit-test','address':{'street':'716 E County RD','city':'Ridgeville','state':'IN','zip':'47394'}}
        row={'number':'716','street':'East County Road','postcode':None,'postal_city':'Ridgeville',
             'address_levels':[{'value':'IN'},{'value':'Winchester'}]}
        self.assertEqual(matching_targets(row,*target_indexes([target])),[(target,'normalized-street-city-state')])
        row['postcode']='99999'
        self.assertEqual(matching_targets(row,*target_indexes([target])),[])

    def test_house_number_and_route_authority_are_not_relaxed(self):
        target={'key':'unit-test','address':{'street':'716 US Highway 40','city':'Ridgeville','state':'IN','zip':'47394'}}
        row={'number':'716','street':'State Highway 40','postcode':'47394','postal_city':'Ridgeville',
             'address_levels':[{'value':'IN'},{'value':'Winchester'}]}
        self.assertEqual(matching_targets(row,*target_indexes([target])),[])
        row['street']='US Highway 40';row['number']='718'
        self.assertEqual(matching_targets(row,*target_indexes([target])),[])

    def test_reuse_fingerprint_keeps_distinct_physical_addresses(self):
        one={'number':'716','street':'East County Road','unit':'1','postcode':'47394',
             'postal_city':'Ridgeville','address_levels':[{'value':'IN'},{'value':'Winchester'}]}
        other={**one,'unit':'2'}
        self.assertEqual(native_street_fingerprint(one),native_street_fingerprint(other))
        other['number']='718'
        self.assertNotEqual(native_street_fingerprint(one),native_street_fingerprint(other))
        self.assertEqual(distinct_fingerprints({'IN|47394|716 E COUNTY RD','?||716 E COUNTY RD'}),{'IN|47394|716 E COUNTY RD'})
        self.assertEqual(len(distinct_fingerprints({'IN|47394|716 E COUNTY RD','OH|47394|716 E COUNTY RD'})),2)
        self.assertEqual(len(distinct_fingerprints({'IN|47394|716 E COUNTY RD','IN|47395|716 E COUNTY RD'})),2)
        self.assertIsNone(native_street_fingerprint({**one,'number':None}))

    def test_wkb_requires_a_finite_actual_point(self):
        import struct
        native=struct.pack('<BIdd',1,1,-85.0,40.0)
        self.assertEqual(wkb_point(native),[40.0,-85.0])
        self.assertIsNone(wkb_point(struct.pack('<BIdd',1,2,-85.0,40.0)))
        self.assertIsNone(wkb_point(struct.pack('<BIdd',1,1,float('nan'),40.0)))
        self.assertEqual(coordinate_key([40.123456789,-85.123456789]),(401234568,-851234568))

    def test_coordinate_consensus_checks_every_pair(self):
        center=[40.0,-85.0];west=[40.0,-85.0008];east=[40.0,-84.9992]
        self.assertTrue(points_agree([center,west]))
        self.assertTrue(points_agree([center,east]))
        self.assertFalse(points_agree([center,west,east]))


if __name__=='__main__': unittest.main()
