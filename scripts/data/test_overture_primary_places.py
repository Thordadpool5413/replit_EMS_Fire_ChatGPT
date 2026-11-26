import copy
import unittest
from match_overture_primary_addresses import distinct_fingerprints,points_agree
from match_overture_primary_places import matching_targets,place_fingerprints,projected_quality_reason,target_refs
from match_overture_primary_addresses import target_indexes
from stage_overture_primary_places import place_address


class PlacesSourceGuards(unittest.TestCase):
    def test_country_and_reported_postal_fields(self):
        raw={'country':'US','region':'NY','locality':'ALBANY','postcode':'12207-1234','freeform':'12 Main Street Suite 4'}
        self.assertEqual(place_address(raw),{'state':'NY','city':'ALBANY','zip':'12207','street':'12 Main Street Suite 4'})
        self.assertIsNone(place_address({**raw,'country':'CA'}))
        self.assertEqual(place_address({**raw,'postcode':None})['zip'],'')

    def test_unit_preserved_and_street_match_conservative(self):
        target={'key':'NPI:1','address':{'street':'12 MAIN ST','city':'ALBANY','state':'NY','zip':'12207'}}
        raw={'country':'US','region':'NY','locality':'ALBANY','postcode':'12207','freeform':'12 Main Street Suite 4'}
        refs=target_refs({'addresses':[raw]},target_indexes([target]))
        self.assertEqual(refs,[{'key':'NPI:1','matchBasis':'normalized-street-city-state-zip','sourceAddressOrdinal':0}])
        self.assertEqual(target_refs({'addresses':[{**raw,'freeform':'13 Main Street'}]},target_indexes([target])),[])

    def test_blank_zip_remains_diagnostic(self):
        target={'key':'x','address':{'street':'12 MAIN ST','city':'ALBANY','state':'NY','zip':'12207'}}
        raw={'country':'US','region':'NY','locality':'ALBANY','postcode':None,'freeform':'12 Main Street'}
        self.assertEqual(target_refs({'addresses':[raw]},target_indexes([target]))[0]['matchBasis'],'normalized-street-city-state')

    def test_existence_and_operating_status_are_separate(self):
        row={'name':'Station','confidence':0.9,'operating_status':'open','basic_category':'fire_station','taxonomy':{'hierarchy':['public_service','fire_station']}}
        self.assertIsNone(projected_quality_reason(row))
        self.assertEqual(projected_quality_reason({**row,'confidence':0.899}),'insufficient-existence-confidence')
        self.assertEqual(projected_quality_reason({**row,'operating_status':'temporarily_closed'}),'not-reported-open')
        self.assertEqual(projected_quality_reason({**row,'taxonomy':{'hierarchy':['geographic_entities','county']}}),'geographic-entity')

    def test_reuse_keeps_conflicting_known_postcodes(self):
        first={'country':'US','region':'NY','locality':'ALBANY','postcode':'12207','freeform':'12 Main Street'}
        row={'addresses':[first,{**first,'postcode':'12208'},{**first,'locality':'CITY ALIAS'}]}
        fingerprints=place_fingerprints(row)
        self.assertEqual(len(distinct_fingerprints(fingerprints)),2)
        self.assertEqual(len(distinct_fingerprints(fingerprints|{'NY||12 MAIN ST'})),2)

    def test_all_pairs_rejects_star_cluster(self):
        self.assertTrue(points_agree([[40,-75],[40.00066,-75]]))
        self.assertFalse(points_agree([[40,-75],[40.00066,-75],[39.99934,-75]]))


if __name__=='__main__': unittest.main()
