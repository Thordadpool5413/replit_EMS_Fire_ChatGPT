import copy,unittest
from recover_nppes_phone_sites import METHOD,build,validate_final_phone_parent
class FinalPhoneDonorTests(unittest.TestCase):
 def donor(self):
  return {'key':'FDID:NY:EXAMPLE','source':'USFA','name':'Example Fire Department','state':'NY','sourceDate':'2026-11-17','sourceCounty':'36001','status':'mapped','countyFips':'36001',
   'address':{'street':'10 Main St','city':'Example','state':'NY','zip':'10001'},
   'match':{'method':'census-address-range','latitude':40,'longitude':-75,'matchedAddress':'10 MAIN ST, EXAMPLE, NY, 10001'}}
 def test_final_parent_must_match_entire_usable_native_entry(self):
  donor=self.donor();entry={'key':'NPI:1234567890','state':'NY','primaryAddressEvidence':{'method':METHOD,'donor':{'entry':copy.deepcopy(donor)}}}
  self.assertTrue(validate_final_phone_parent(entry,{donor['key']:donor}))
  for change in[{'status':'no-match'},{'countyFips':'36003'},{'match':{**donor['match'],'latitude':40.01}},{'name':'Changed name'}]:
   altered={**donor,**change};self.assertFalse(validate_final_phone_parent(entry,{donor['key']:altered}))
 def test_legacy_census_donor_keeps_actual_match_without_invented_point(self):
  donor=self.donor();old={'key':'NPI:1234567890','name':'Example Ambulance','source':'NPPES','state':'NY','sourceDate':'2026-11','sourceCounty':'','status':'no-match','address':{'street':'PO Box 9','city':'Example','state':'NY','zip':'10001'}}
  pair={'key':old['key'],'donorPrimaryKey':donor['key'],'donorOriginalName':donor['name'],'donorOriginalAddress':donor['address'],'nameBasis':{'rule':'normalized-complete-native-name'}}
  snapshot={'entries':[old,donor],'baselineIndexSha256':'b','nationalRegistrySha256':'n'}
  report=build(snapshot,{'candidatePairs':[pair]},{'reportSha256':'p'},'index-sha',[donor],'audit-sha')
  candidate=report['candidates'][0]
  self.assertEqual(candidate['match'],donor['match']);self.assertNotIn('point',candidate['match']);self.assertNotIn('sourceAddress',candidate['match'])
  self.assertEqual(candidate['primaryAddressEvidence']['donor']['entry'],donor)
  self.assertEqual(candidate['primaryAddressEvidence']['siteRole'],'correlated-usfa-primary-site')
 def test_unusable_donor_never_produces_a_phone_child(self):
  donor=self.donor();donor['countyFips']='36003'
  old={'key':'NPI:1234567890','name':'Example','source':'NPPES','state':'NY','sourceDate':'2026','sourceCounty':'','status':'no-match','address':None}
  pair={'key':old['key'],'donorPrimaryKey':donor['key'],'donorOriginalName':donor['name'],'donorOriginalAddress':donor['address']}
  report=build({'entries':[old,donor],'baselineIndexSha256':'b','nationalRegistrySha256':'n'},{'candidatePairs':[pair]},{'reportSha256':'p'},'i',[donor],'a')
  self.assertEqual(report['candidates'],[]);self.assertEqual(len(report['withheld']),1)
if __name__=='__main__':unittest.main()
