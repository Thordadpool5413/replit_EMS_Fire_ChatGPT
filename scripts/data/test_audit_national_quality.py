import unittest
from audit_national_quality import audit, valid_npi, coordinate_review

class NationalQualityTest(unittest.TestCase):
    def test_npi_checksum(self):
        self.assertTrue(valid_npi('1234567893'))
        self.assertFalse(valid_npi('1234567890'))
        self.assertFalse(valid_npi('abcdefghij'))

    def test_grain_and_county_conflicts(self):
        address={'street':'100 Main Street','city':'Example','state':'FL','zip':'32001'}
        a={'key':'FDID:FL:00123','source':'USFA','state':'FL','address':address,'status':'mapped','sourceCounty':'12001','countyFips':'12003','match':{'method':'census-address-range','latitude':29.1,'longitude':-81.2}}
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

    def test_coordinate_review_keeps_colocation_separate_from_conflict(self):
        def entry(key,street,lat,lon,method='census-address-range'):
            return {'key':key,'state':'FL','status':'mapped','address':{'street':street,'city':'Example','state':'FL','zip':'32001'},'match':{'method':method,'latitude':lat,'longitude':lon}}
        a=entry('FDID:FL:1','100 Main Street',29.1,-81.2)
        b=entry('NPI:1234567893','100 Main St Suite 4',29.1,-81.2)
        c=entry('FDID:FL:2','102 Main Street',29.1,-81.2)
        d=entry('FDID:FL:3','100 Main Street',29.2,-81.2,'regional-address-point')
        e=entry('FDID:FL:4','200 Main Street',29.3,-81.2)
        f=entry('FDID:FL:5','200 Main St',29.3,-81.2)
        rows=[a,b,c,d,e,f,{**a,'key':'unmapped','status':'no-match','match':None}]
        r=coordinate_review(rows)
        self.assertEqual(r['mappedSourceRecords'],6)
        self.assertEqual(r['samePointSameAddress']['groups'],1)
        self.assertEqual(r['samePointDifferentAddress']['sourceRecords'],3)
        self.assertEqual(r['sameAddressDifferentPoint']['sourceRecords'],3)
        self.assertEqual(r['samePointDifferentAddress']['reviewGroups'][0]['sourceKeys'],['FDID:FL:1','FDID:FL:2','NPI:1234567893'])
        self.assertEqual(r,coordinate_review(list(reversed(rows))))
        self.assertEqual(a['match']['latitude'],29.1)
        with self.assertRaises(ValueError):coordinate_review([entry('bad','100 Main Street',float('nan'),-81.2)])
