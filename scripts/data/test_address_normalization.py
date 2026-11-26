import unittest
from address_normalization import normalize_street, source_street_line, physical_address, same_address

class AddressNormalizationTest(unittest.TestCase):
    def test_only_documented_full_words_change(self):
        self.assertEqual(normalize_street('123 North Main Street'), '123 N MAIN ST')
        self.assertEqual(normalize_street('123 Foothill Parkway'), '123 FOOTHILL PKWY')
        self.assertNotEqual(normalize_street('123 1st St'), normalize_street('123 First St'))
        self.assertNotEqual(normalize_street('123 State Route 6'), normalize_street('123 US Route 6'))
        self.assertNotEqual(normalize_street('123 Main St'), normalize_street('124 Main St'))

    def test_explicit_units_do_not_truncate_street_names(self):
        self.assertEqual(source_street_line('123 Main St, Suite 204'), '123 Main St')
        self.assertEqual(source_street_line('123 Main St UNIT A'), '123 Main St')
        self.assertEqual(source_street_line('123 Main FLOOR ROAD'), '123 Main FLOOR ROAD')
        self.assertEqual(source_street_line('123 Main St Suite'), '123 Main St Suite')

    def test_locality_and_postal_guards(self):
        a=dict(street='123 Main Street',city='Town',state='OH',zip='43215')
        b=dict(a,street='123 Main ST',city='Different Town')
        self.assertFalse(same_address(a,b))
        self.assertTrue(same_address(a,b,include_city=False))
        self.assertFalse(same_address(a,dict(b,zip='43216'),include_city=False))
        self.assertFalse(physical_address(dict(a,street='PO BOX 123')))
        self.assertFalse(physical_address(dict(a,zip='')))

if __name__=='__main__': unittest.main()
