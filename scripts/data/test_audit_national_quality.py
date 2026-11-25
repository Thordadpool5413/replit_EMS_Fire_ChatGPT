import unittest
from audit_national_quality import audit, valid_npi

class NationalQualityTest(unittest.TestCase):
    def test_npi_checksum(self):
        self.assertTrue(valid_npi('1234567893'))
        self.assertFalse(valid_npi('1234567890'))
        self.assertFalse(valid_npi('abcdefghij'))

    def test_grain_and_county_conflicts(self):
        address={'street':'100 Main Street','city':'Example','state':'FL','zip':'32001'}
        a={'key':'FDID:FL:00123','source':'USFA','state':'FL','address':address,'status':'mapped','sourceCounty':'12001','countyFips':'12003','match':{'method':'census-address-range'}}
        b={**a,'key':'NPI:1234567893','source':'NPPES','sourceCounty':'12003'}
        c={**a,'key':'FDID:FL:00999','status':'no-match','countyFips':'','match':None}
        rows=[['usfa:FL:00123','USFA','Fixture','FL'],['nppes:1234567893','NPPES','Fixture','FL']]
        r=audit([a,b,c],rows)
        self.assertEqual(r['mapping']['totals']['mappedUsable'],1)
        self.assertEqual(r['mapping']['totals']['countyConflict'],1)
        self.assertEqual(r['mapping']['totals']['recoverable'],1)
        self.assertEqual(r['coordinateMethods']['census-address-range'],{'raw':2,'usable':1})
        self.assertEqual(r['coLocationReview'],{'crossSourceAddressGroups':1,'sourceRowsInGroups':3})
        self.assertIn('current equipment inventory',r['domainsNotMeasured'])
        with self.assertRaises(ValueError): audit([a,a],rows)
        with self.assertRaises(ValueError): audit([{**a,'address':{**address,'state':'GA'}}],rows)
