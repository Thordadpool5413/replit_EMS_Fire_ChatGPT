import copy,unittest
from recover_nppes_primary_components_extended import bucket,choose_location,observation,adapted_nad_target
class NativeSourceConsensusTests(unittest.TestCase):
 def observed(self,latitude,source='usgs',selectable=True):
  return {'source':source,'selectable':selectable,'candidate':{'match':{'method':'usgs-structure-address','latitude':latitude,'longitude':-75,'point':{'countyFips':'36001','precision':'structure-centroid'}},'countyFips':'36001'}}
 def witnesses(self,*latitudes):
  return [{'latitude':y,'longitude':-75,'countyFips':'36001'}for y in latitudes]
 def test_unselected_city_endpoint_participates_in_every_pair(self):
  b=bucket();b['pointObservations']=[self.observed(40),self.observed(40.0005,'federal-city:usgs',False),self.observed(39.9995)]
  self.assertEqual(choose_location(b,self.witnesses(40,40.0005,39.9995))[1],'qualified-source-coordinate-disagreement')
 def test_native_positive_veto_cannot_be_overridden_by_good_point(self):
  b=bucket();b['pointObservations']=[self.observed(40)];b['pointConflicts']=[{'reason':'retired-native-address'}]
  self.assertEqual(choose_location(b,self.witnesses(40)),(None,'qualified-native-source-conflict'))
 def test_range_cannot_move_or_veto_valid_address_point(self):
  b=bucket();point=self.observed(40);b['pointObservations']=[point];b['rangeConflicts']=[{'reason':'conflicting-native-ranges'}]
  selected,reason=choose_location(b,self.witnesses(40));self.assertEqual(selected,point);self.assertEqual(reason,'native-component-address-point')
 def test_incomplete_point_provenance_blocks_range_fallback(self):
  b=bucket();b['pointBlocks']=[{'reason':'native-nad-status-not-retained'}];b['rangeObservations']=[{'source':'tiger'}]
  self.assertEqual(choose_location(b,[]),(None,'incomplete-or-unqualified-native-point-source'))
 def test_missing_required_native_component_proof_is_not_optional(self):
  address={'street':'10 Main St','city':'Example','state':'NY','zip':'10001'};target={'key':'NPI:1234567890','address':address}
  c={'key':target['key'],'address':address,'originalAddress':address,'countyFips':'36001','match':{'point':{'countyFips':'36001'}}}
  with self.assertRaises(ValueError):observation('overture-address',c,target,component={'sourceField':'line1'})
  c['componentEvidence']={'sourceField':'line1'}
  self.assertTrue(observation('overture-address',c,target,component=c['componentEvidence']))
 def test_nad_adapter_preserves_every_native_field(self):
  target={'key':'NPI:1234567890','sourceCounty':'36001','address':{'street':'10 Main St'},'componentEvidence':{'sourceField':'line1'}}
  actual=adapted_nad_target(target);self.assertEqual(actual['key'],target['key']+'@NPPES-PRIMARY');self.assertEqual(actual['originalPrimaryKey'],target['key'])
  self.assertEqual({k:v for k,v in actual.items()if k not in('key','originalPrimaryKey')},{k:v for k,v in target.items()if k!='key'})
  self.assertEqual(target['key'],'NPI:1234567890')
if __name__=='__main__':unittest.main()
