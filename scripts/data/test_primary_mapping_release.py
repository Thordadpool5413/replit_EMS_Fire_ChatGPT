import copy,unittest
from unittest.mock import patch
from build_primary_mapping_release import metric,apply_candidate,combine

class PrimaryReleaseTest(unittest.TestCase):
    def setUp(self):
        self.native_veto_patch=patch('build_primary_mapping_release.native_neris_vetoes',return_value=[])
        self.native_veto_patch.start();self.addCleanup(self.native_veto_patch.stop)
        self.witness_patch=patch('build_primary_mapping_release.entry_witnesses',side_effect=lambda entry:[{'method':entry['match']['method'],'latitude':entry['match']['latitude'],'longitude':entry['match']['longitude'],'countyFips':entry['countyFips']}])
        self.witness_mock=self.witness_patch.start();self.addCleanup(self.witness_patch.stop)
    def test_threshold_counts_usable_original_primary_records(self):
        mapped={'status':'mapped','match':{'method':'census-address-range'},'source':'USFA','sourceCounty':'01001','countyFips':'01001'}
        pending={'status':'no-match','match':None,'source':'USFA','sourceCounty':'01001','countyFips':''}
        records=[mapped]*44451+[pending]*(46791-44451)
        self.assertFalse(metric(records)['targetMet'])
        records[44451]=mapped;self.assertTrue(metric(records)['targetMet'])
        records[0]={**mapped,'countyFips':'01003'}
        result=metric(records);self.assertFalse(result['targetMet']);self.assertEqual(result['usableMapped'],44451);self.assertEqual(result['countyConflictsWithheld'],1)
    def original(self):
        return {'key':'FDID:AK:11100','name':'Example','source':'USFA','state':'AK','sourceDate':'2026-11-26','sourceCounty':'02110','address':{'street':'820 Glacier Ave','city':'Juneau','state':'AK','zip':'99801'},'status':'no-match','match':None,'countyFips':''}
    def candidate(self,method='usgs-structure-address',longitude=-134.42169):
        e=self.original()
        return {'key':e['key'],'originalAddress':e['address'],'address':e['address'],'countyFips':'02110','match':{'method':method,'latitude':58.30107,'longitude':longitude,'point':{'objectId':1}}}
    def test_candidates_cannot_change_source_identity_or_original_address(self):
        e=self.original();c=self.candidate()
        for changes in ({'key':'FDID:AK:OTHER'},{'name':'Different agency'},{'sourceCounty':'02020'},{'originalAddress':None},{'address':dict(e['address'],street='821 Glacier Ave')}):
            with self.assertRaises(ValueError):apply_candidate(e,{**c,**changes})
    def test_qualified_coordinate_conflicts_cannot_be_cherry_picked(self):
        e=self.original();reports=[{'candidates':[self.candidate()]},{'candidates':[self.candidate('hifld-ems-address',-134.44)]}]
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([e],None,reports,{})
        self.assertEqual(rows,[e]);self.assertEqual(len(review['qualifiedSourceConflicts']),1)
    def test_new_station_identity_never_enters_denominator(self):
        c=self.candidate();c['key']+='@NERIS-HQ'
        with self.assertRaises(ValueError):combine([self.original()],None,[{'candidates':[c]}],{})
    def test_consensus_checks_the_entire_point_cluster(self):
        e=self.original();middle=self.candidate();east=self.candidate('hifld-ems-address',-134.42044);west=self.candidate('hifld-fire-address',-134.42294)
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([e],None,[{'candidates':[middle,east,west]}],{})
        self.assertEqual(rows,[e]);self.assertEqual(len(review['qualifiedSourceConflicts']),1)
    def test_legacy_audit_cannot_be_omitted(self):
        e=self.original();e.update(status='mapped',match=self.candidate('neris-reported-address')['match'],countyFips='02110')
        with self.assertRaisesRegex(ValueError,'legacy NERIS audit'):combine([e],None,[],{})

    def run_reports(self,reports):
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            return combine([self.original()],None,reports,{})

    def test_qualified_negative_evidence_cannot_be_ignored(self):
        candidate=self.candidate()
        rejection={'key':candidate['key'],'originalAddress':candidate['address'],
                   'reasons':['source-coordinate-shared-across-distinct-addresses']}
        rows,review=self.run_reports([{'source':'usgs','candidates':[candidate]},
                                     {'source':'hifld-fire','candidates':[],'rejected':[rejection]}])
        self.assertEqual(rows,[self.original()])
        self.assertEqual(review['qualifiedSourceConflicts'][0]['reason'],'qualified-source-negative-evidence')

    def test_negative_evidence_is_scoped_to_the_queried_physical_site(self):
        candidate=self.candidate()
        other=dict(candidate['address'],street='900 Different Road')
        rejection={'key':candidate['key'],'targetAddress':other,'reasons':['conflicting-native-points']}
        rows,review=self.run_reports([{'source':'usgs','candidates':[candidate],'rejected':[rejection]}])
        self.assertEqual(rows[0]['status'],'mapped')
        self.assertFalse(review['qualifiedSourceConflicts'])

    def test_missing_source_attribution_is_not_a_contradictory_point(self):
        candidate=self.candidate()
        rows,_=self.run_reports([{'source':'usgs','candidates':[candidate],'rejected':[
            {'key':candidate['key'],'reasons':['missing-native-attribution']}]}])
        self.assertEqual(rows[0]['status'],'mapped')

    def test_native_source_veto_survives_a_clean_other_source_point(self):
        with patch('build_primary_mapping_release.native_neris_vetoes',return_value=['source-county-disagreement']):
            rows,review=self.run_reports([{'candidates':[self.candidate()]}])
        self.assertEqual(rows,[self.original()])
        self.assertEqual(review['qualifiedSourceConflicts'][0]['sourceRejections'][0]['source'],'neris')

    def test_range_does_not_move_or_veto_a_qualified_address_point(self):
        point=self.candidate()
        interpolated=self.candidate('tiger-address-range',-134.49)
        rejected={'key':point['key'],'targetAddress':point['address'],'reasons':['conflicting-native-ranges']}
        rows,_=self.run_reports([{'source':'usgs','candidates':[point]},
                               {'source':'tiger','method':'tiger-address-range','candidates':[interpolated],'rejected':[rejected]}])
        self.assertEqual(rows[0]['match'],point['match'])

    def test_range_cannot_rescue_a_qualified_point_conflict(self):
        interpolated=self.candidate('tiger-address-range')
        rejected={'key':interpolated['key'],'originalAddress':interpolated['address'],
                  'reasons':['primary-source-county-disagreement']}
        rows,_=self.run_reports([{'source':'tiger','candidates':[interpolated]},
                               {'source':'hifld-ems','candidates':[],'rejected':[rejected]}])
        self.assertEqual(rows,[self.original()])

    def test_consensus_expands_source_endpoints_beyond_each_winner(self):
        point=self.candidate()
        self.witness_mock.side_effect=lambda entry:[
            {'method':entry['match']['method'],'latitude':entry['match']['latitude'],'longitude':entry['match']['longitude'],'countyFips':entry['countyFips']},
            {'method':'usgs-structure-address','latitude':58.30107,'longitude':-134.42044,'countyFips':'02110'},
            {'method':'usgs-structure-address','latitude':58.30107,'longitude':-134.42294,'countyFips':'02110'}]
        rows,review=self.run_reports([{'candidates':[point]}])
        self.assertEqual(rows,[self.original()])
        self.assertEqual(len(review['qualifiedSourceConflicts'][0]['points']),3)

    def test_phone_child_cannot_reintroduce_a_withheld_parent(self):
        parent=self.original()
        child=dict(parent,key='NPI:1234567890',source='NPPES',name='Example Ambulance')
        donor=apply_candidate(parent,self.candidate())
        child_candidate={**self.candidate(),'key':child['key'],'primaryAddressEvidence':{
            'method':'nppes-usfa-primary-site-correlation','association':'inferred',
            'siteRole':'correlated-usfa-primary-site','donor':{'entry':donor}}}
        reports=[{'candidates':[self.candidate(),self.candidate('hifld-ems-address',-134.49),child_candidate]}]
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([parent,child],None,reports,{})
        self.assertEqual(rows,[parent,child])
        self.assertEqual(review['stalePhoneDonorsWithheld'][0]['key'],child['key'])

    def test_phone_child_binds_to_the_exact_final_usable_parent(self):
        parent=self.original()
        child=dict(parent,key='NPI:1234567890',source='NPPES',name='Example Ambulance')
        donor=apply_candidate(parent,self.candidate())
        child_candidate={**self.candidate(),'key':child['key'],'primaryAddressEvidence':{
            'method':'nppes-usfa-primary-site-correlation','association':'inferred',
            'siteRole':'correlated-usfa-primary-site','donor':{'entry':donor}}}
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([child,parent],None,[{'candidates':[child_candidate,self.candidate()]}],{})
        self.assertTrue(all(row['status']=='mapped' for row in rows))
        self.assertFalse(review['stalePhoneDonorsWithheld'])

    def test_unbound_diagnostic_veto_is_an_error(self):
        rejection={'key':self.original()['key']+'@UNBOUND','reasons':['conflicting-native-points']}
        with self.assertRaisesRegex(ValueError,'target-address binding'):
            self.run_reports([{'candidates':[self.candidate()],'rejected':[rejection]}])

    def test_legacy_census_phone_coordinate_does_not_require_a_point_object(self):
        from build_primary_mapping_release import rank
        entry=apply_candidate(self.original(),self.candidate('census-address-range'))
        entry['match'].pop('point')
        self.assertEqual(rank(entry)[0],21)

    def test_a_withdrawn_legacy_coordinate_does_not_veto_current_native_consensus(self):
        original=self.original()
        original.update(status='mapped',match=self.candidate('neris-reported-address',-134.49)['match'],countyFips='02110')
        report={'candidates':[],'legacyAudit':[{'key':original['key'],'accepted':False,
            'reason':'legacy-point-disagrees-with-native-address','candidate':None}],
            'originalAddressCoordinateConflicts':[{'key':original['key'],'originalAddress':original['address'],
            'reason':'legacy-point-disagrees-with-native-address'}]}
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,review=combine([original],report,[{'candidates':[self.candidate()]}],{})
        self.assertEqual(rows[0]['match'],self.candidate()['match'])
        self.assertFalse(review['qualifiedSourceConflicts'])

    def test_nested_city_conflict_keeps_its_qualified_native_reason(self):
        candidate=self.candidate()
        rejection={'key':candidate['key'],'targetAddress':candidate['address'],
            'reason':'native-city-source-conflict','sourceConflicts':[
                {'source':'usgs','sourceConflicts':[{'reason':'native-point-disagreement'}]}]}
        rows,review=self.run_reports([{'candidates':[candidate],'rejected':[rejection]}])
        self.assertEqual(rows,[self.original()])
        self.assertEqual(review['qualifiedSourceConflicts'][0]['sourceRejections'][0]['reasons'],['native-point-disagreement'])

    def test_component_veto_uses_explicit_target_over_original_combined_address(self):
        candidate=self.candidate()
        candidate['address']=dict(candidate['address'],street='900 Glacier Ave')
        candidate['primaryAddressEvidence']={'method':'nppes-primary-address-components','association':'source-native'}
        rejection={'key':candidate['key'],'targetAddress':candidate['address'],
                   'originalAddress':self.original()['address'],'reason':'qualified-source-point-disagreement'}
        rows,_=self.run_reports([{'candidates':[candidate],'rejected':[rejection]}])
        self.assertEqual(rows,[self.original()])

    def test_original_rejection_does_not_take_another_batch_with_the_same_key(self):
        from build_primary_mapping_release import BASELINE_INDEX_SHA
        candidate=self.candidate()
        target={'key':candidate['key'],'address':dict(candidate['address'],street='900 Different Road')}
        report={'source':'usgs','baselineIndexSha256':BASELINE_INDEX_SHA,'candidates':[candidate],
                'rejected':[{'key':candidate['key'],'reason':'conflicting-native-points'}]}
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,_=combine([self.original()],None,[report],{},[{'sha256':'a'*64,'targets':[target]}])
        self.assertEqual(rows,[self.original()])

    def test_declared_target_scope_is_required_even_when_another_batch_key_matches(self):
        candidate=self.candidate()
        target={'key':candidate['key'],'address':dict(candidate['address'],street='900 Different Road')}
        report={'source':'overture','targetsSha256':'b'*64,'candidates':[candidate],
                'rejected':[{'key':candidate['key'],'reason':'conflicting-native-points'}]}
        with self.assertRaisesRegex(ValueError,'exact declared target scope'):
            combine([self.original()],None,[report],{},[{'sha256':'a'*64,'targets':[target]}])

    def test_canonical_target_digest_resolves_a_wrapped_target_file(self):
        from build_primary_mapping_release import sha,dump
        candidate=self.candidate()
        target={'key':candidate['key'],'address':candidate['address']}
        report={'source':'overture','targetsSha256':sha(dump([target])),'candidates':[candidate],
                'rejected':[{'key':candidate['key'],'reason':'conflicting-native-points'}]}
        with patch('build_primary_mapping_release.validate_primary_entry',return_value=True):
            rows,_=combine([self.original()],None,[report],{},[{'sha256':'a'*64,'targets':[target]}])
        self.assertEqual(rows,[self.original()])

    def test_native_endpoint_expansion_must_include_its_selected_display_point(self):
        self.witness_mock.side_effect=lambda entry:[
            {'method':entry['match']['method'],'latitude':58.30107,'longitude':-134.49,'countyFips':'02110'}]
        with self.assertRaisesRegex(ValueError,'omits the selected display point'):
            self.run_reports([{'candidates':[self.candidate()]}])

    def test_nested_range_rejection_preserves_its_lower_precision(self):
        candidate=self.candidate()
        rejection={'key':candidate['key'],'targetAddress':candidate['address'],
            'reason':'valid-independent-source-conflict','sourceConflicts':[
                {'source':'tiger','reason':'conflicting-native-ranges'}]}
        rows,_=self.run_reports([{'method':'nppes-primary-address-components','candidates':[candidate],
                                'rejected':[rejection]}])
        self.assertEqual(rows[0]['status'],'mapped')
        rows,_=self.run_reports([{'method':'nppes-primary-address-components',
                                'candidates':[self.candidate('tiger-address-range')],'rejected':[rejection]}])
        self.assertEqual(rows,[self.original()])

    def test_nested_precise_source_conflict_is_not_hidden_by_a_range_conflict(self):
        candidate=self.candidate()
        rejection={'key':candidate['key'],'targetAddress':candidate['address'],
            'reason':'valid-independent-source-conflict','sourceConflicts':[
                {'source':'tiger','reason':'conflicting-native-ranges'},
                {'source':'usgs','reason':'primary-source-county-disagreement'}]}
        rows,review=self.run_reports([{'method':'nppes-primary-address-components',
                                      'candidates':[candidate],'rejected':[rejection]}])
        self.assertEqual(rows,[self.original()])
        self.assertEqual([row['source'] for row in review['qualifiedSourceConflicts'][0]['sourceRejections']],['usgs'])

if __name__=='__main__':unittest.main()
