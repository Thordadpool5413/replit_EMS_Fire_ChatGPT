import csv,io,unittest
from stage_nppes_secondary import FIELDS,acquire,output_files,eligible_targets
class SecondaryTests(unittest.TestCase):
    def test_full_reference_accounting_and_distinct_sites(self):
        npi='1003006180';other='1234567893';historical='1111111112'
        a={'street':'123 MAIN ST','city':'EXAMPLE','state':'NV','zip':'89081'}
        p={'source':'NPPES','key':'NPI:'+npi,'name':'Fixture EMS','state':'NV','sourceDate':'2026-11-09 monthly release','status':'no-match','address':a}
        targets={npi:p,other:{**p,'key':'NPI:'+other,'name':'Another EMS','status':'mapped'},historical:{**p,'status':'historical'}}
        def row(id,street='456 SECOND ST',extra='',state='AZ',postal='85001',country=''):
            return [id,street,extra,'EXAMPLE',state,postal,country,'private-phone','private-extension','private-fax']
        stream=io.StringIO();w=csv.writer(stream);w.writerow(FIELDS)
        w.writerows([row(npi),row(npi),row(npi,extra='STE 2'),row(other),row(npi,'123 MAIN ST',state='NV',postal='89081'),row(npi,'PO BOX 1'),row(npi,country='CA'),row(historical),row('unrelated')]);stream.seek(0)
        rows,counts=acquire(stream,targets)
        self.assertEqual(counts['referenceRows'],9);self.assertEqual(counts['targetReferenceRows'],8)
        self.assertEqual(counts['acceptedSecondary'],3);self.assertEqual(counts['duplicateSecondary'],1);self.assertEqual(counts['primaryDuplicate'],1)
        self.assertEqual(counts['historicalParent'],1);self.assertEqual(counts['nonUsAddress'],1);self.assertEqual(counts['unsupportedAddress'],1)
        self.assertEqual(counts['crossStateSecondary'],3);self.assertEqual(counts['sharedAddressRows'],2);self.assertEqual(counts['distinctParentNpisWithSecondary'],2)
        self.assertEqual(counts['parentsWithoutPrimaryMapWithSecondary'],1)
        self.assertTrue(all(not r['publicationEligible'] and not r['stationIdentityEstablished'] for r in rows))
        self.assertNotIn('private-phone',str(rows));self.assertNotIn('latitude',str(rows))
        self.assertEqual(set(output_files({'records':rows,'counts':counts})),{'10.json','12.json','index.json'})
        with self.assertRaises(ValueError):acquire(io.StringIO('NPI,Unknown\n'),targets)
    def test_exact_parent_identity(self):
        row={'source':'NPPES','key':'NPI:1003006180'}
        self.assertEqual(eligible_targets([row]),{'1003006180':row})
        with self.assertRaises(ValueError):eligible_targets([row,row])
        with self.assertRaises(ValueError):eligible_targets([{**row,'key':'NPI:1234567890'}])
