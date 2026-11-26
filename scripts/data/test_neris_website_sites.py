import copy
import unittest
from neris_website_identity import canonical_website, host_witnesses, identity_indices, correlate
from test_neris_primary_rebuilt import primary, department, native
from test_neris_mailing_sites import feature

class NativeWebsiteTests(unittest.TestCase):
    def setUp(self):
        self.entry = primary(); self.department = department()
        self.feature = feature(self.department); self.feature['attributes']['website'] = 'https://www.springfieldfire.example.org/'
        n = {'FDID': '1', 'Fire dept name': self.entry['name'], 'HQ addr1': 'PO BOX 7', 'HQ addr2': '',
             'HQ city': 'Springfield', 'HQ state': 'AL', 'HQ zip': '36001', 'Website': 'http://springfieldfire.example.org'}
        self.usfa = {'rows': [{'sourceRowNumber': 2, 'nativeRecordSha256': 'a'*64, 'native': n}], 'quarantined': [],
                     'baselineReconciliation': [{'primaryKey': self.entry['key'], 'outcome': 'exact-fdid-state-name-city-zip'}]}

    def select(self, features=None):
        indices = identity_indices({'features': features or [self.feature]}, self.usfa)
        return correlate(self.entry, native(self.entry), indices, {1: self.department})

    def test_exact_public_native_website_full_name_city_and_zip_correlate(self):
        pair, reason = self.select(); self.assertIsNone(reason)
        self.assertEqual(pair[1]['websiteBasis'], 'canonical-url')
        self.assertEqual(pair[1]['nativeUsfaWebsiteAsReported'], 'http://springfieldfire.example.org')
        self.assertFalse(pair[1]['websiteOwnershipChecked'])

    def test_full_native_inventory_host_ambiguity_is_not_name_filtered(self):
        other = copy.deepcopy(self.feature); other['attributes'].update(OBJECTID=2, name='Different Fire Department')
        self.assertEqual(self.select([self.feature, other])[1], 'nonreciprocal-complete-native-website')

    def test_complete_primary_host_inventory_is_reciprocal(self):
        other = copy.deepcopy(self.usfa['rows'][0]); other['sourceRowNumber']=3; other['native']['FDID']='2'
        self.usfa['rows'].append(other)
        self.assertEqual(self.select()[1], 'nonreciprocal-complete-native-website')

    def test_malformed_native_row_domain_is_a_conservative_ambiguity_veto(self):
        self.usfa['quarantined'].append({'rawFragment': 'broken,"https://springfieldfire.example.org/path",row'})
        self.assertEqual(self.select()[1], 'malformed-native-row-website-ambiguity')

    def test_shared_host_requires_complete_city_and_zip(self):
        self.feature['attributes']['city']='Other'; self.feature['attributes']['mail_city']='Other'
        self.assertEqual(self.select()[1], 'website-identity-lacks-complete-native-city-and-zip')

    def test_generic_sites_ip_addresses_credentials_and_ambiguous_text_are_excluded(self):
        for value in ('https://facebook.com/UniqueDepartment', '192.168.0.1', 'https://user:password@fire.example.org',
                      'fire.example.org and another.org', 'mailto:dept@example.org'):
            self.assertIsNone(canonical_website(value), value)

    def test_default_port_and_single_www_are_normalized_but_path_case_query_fragment_preserved(self):
        self.assertEqual(canonical_website('HTTP://WWW.Fire.Example.org:80/about/')['canonicalUrl'], 'fire.example.org/about')
        self.assertNotEqual(canonical_website('fire.example.org/About?x=1#A')['canonicalUrl'],
                            canonical_website('fire.example.org/about?x=1#A')['canonicalUrl'])
        self.assertEqual(host_witnesses('broken text fire.example.org/department'), {'fire.example.org'})

if __name__ == '__main__':
    unittest.main()
