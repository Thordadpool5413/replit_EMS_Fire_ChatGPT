import copy
import unittest
from recover_neris_mailing_sites import identity_indices, correlate, diagnostic_target, mailing_street, MAILING_FIELDS, PHYSICAL_FIELDS
from test_neris_primary_rebuilt import primary, department, native

def feature(d, mailbox='P.O. Box 7', mail_city='Springfield', mail_zip='36001'):
    a = {'OBJECTID': d['oid'], 'name': d['name']}
    a.update(zip(PHYSICAL_FIELDS, d['address']))
    a.update(zip(MAILING_FIELDS, [mailbox, None, mail_city, d['state'], mail_zip]))
    return {'attributes': a}

class NerisMailingIdentityTests(unittest.TestCase):
    def setUp(self):
        self.entry = primary()
        self.department = department()
        self.department['address'][2] = 'Physical Township'
        self.department['address'][4] = '36009'
        self.inputs = {'entries': [self.entry], 'nationalRows': [native(self.entry)]}

    def select(self, features, entries=None):
        inputs = self.inputs if entries is None else {'entries': entries, 'nationalRows': [native(e) for e in entries]}
        indices = identity_indices(inputs, {'features': features})
        departments = {1: self.department}
        return correlate(self.entry, indices, departments)

    def test_mailing_locality_is_explicit_and_hq_locality_is_preserved(self):
        d, proof = self.select([feature(self.department)])
        self.assertEqual(proof['localityRole'], 'native-mailing')
        self.assertEqual(proof['nameBasis'], 'normalized-complete-name-mailing-street-city-state-zip')
        self.assertEqual(proof['nativeMailingAddressAsReported'][0], 'P.O. Box 7')
        self.assertEqual(d['address'][2:], ['Physical Township', 'AL', '36009'])
        self.assertEqual(self.entry['address']['street'], 'PO BOX 7')

    def test_full_source_physical_alternative_can_make_mailing_identity_ambiguous(self):
        other = department('FD01001002', 'PO BOX 7')
        other['oid'] = 2
        self.assertIsNone(self.select([feature(self.department), feature(other, 'PO BOX 9')]))

    def test_exact_mail_street_can_resolve_locality_homonyms(self):
        other = department('FD01001002', '456 Other Road')
        other['oid'] = 2
        self.assertIsNotNone(self.select([feature(self.department), feature(other, 'PO BOX 9')]))

    def test_reciprocal_primary_street_ambiguity_is_withheld(self):
        other = primary('FDID:AL:2')
        self.assertIsNone(self.select([feature(self.department)], [self.entry, other]))

    def test_mapped_primary_still_participates_in_uniqueness(self):
        other = primary('FDID:AL:2'); other['status'] = 'mapped'
        self.assertIsNone(self.select([feature(self.department)], [self.entry, other]))

    def test_mail_street_normalization_does_not_change_box_number(self):
        self.assertEqual(mailing_street('P.O. BOX 7'), mailing_street('PO BOX 7'))
        self.assertNotEqual(mailing_street('PO BOX 7'), mailing_street('PO BOX 70'))

    def test_physical_hq_with_mail_second_line_cannot_be_replaced_by_station(self):
        self.department['address'][1] = 'PO BOX 7'
        self.department['coordinates'] = None
        d, correlation = self.select([feature(self.department)])
        target = diagnostic_target(self.entry, d, correlation, 'site-no-source-coordinate', set())
        self.assertEqual(target['primaryAddressEvidence']['siteRole'], 'reported-headquarters')
        self.assertEqual(target['address']['street'], '123 Main Street')
        self.assertIsNone(target['primaryAddressEvidence']['site']['coordinatesAsReported'])

    def test_distinct_physical_second_line_is_held(self):
        self.department['address'][1] = '789 Second Street'
        d, correlation = self.select([feature(self.department)])
        self.assertIsNone(diagnostic_target(self.entry, d, correlation, 'site-conflicting-native-address-lines', set()))

if __name__ == '__main__':
    unittest.main()
