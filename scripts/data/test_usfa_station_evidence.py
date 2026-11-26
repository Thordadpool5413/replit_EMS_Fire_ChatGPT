import csv,io,unittest
from stage_usfa_station_evidence import FIELDS,parse
class USFAStationTests(unittest.TestCase):
    def test_state_scoped_parent_and_literal_id(self):
        def parent(state,name):return ['usfa:'+state+':0012','USFA',name,state,'Example','75001','','','','','','']
        buf=io.StringIO();w=csv.writer(buf);w.writerow(FIELDS)
        a=['0012','TX','Fixture Station','TX','123 Main St','','Example','75001']
        w.writerows([a,a,['0012','FL','Other Station','GA','456 Main St','','Example','30001'],['0012','NY','Unlinked Station','NY','PO Box 1','','Example','10001'],['bad id','TX','Bad','TX','123 Main St','','Example','75001']])
        rows,counts=parse(buf.getvalue().encode(),[parent('TX','Fixture TX'),parent('FL','Fixture FL')],minimum=1)
        self.assertEqual(counts['sourceRows'],5);self.assertEqual(counts['retainedRows'],4)
        self.assertEqual(counts['exactParentRows'],3);self.assertEqual(counts['crossStateRows'],1)
        self.assertEqual(counts['duplicateSourceRows'],2);self.assertEqual(counts['physicalAddressRows'],3)
        self.assertEqual(rows[0]['fdidAsReported'],'0012');self.assertEqual(rows[2]['parentReviewKey'],'FDID:FL:0012')
        self.assertIsNone(rows[3]['parentReviewKey']);self.assertIsNone(rows[3]['physicalAddressCandidate'])
        self.assertTrue(all(r['stationIdentifier'] is None and not r['publicationEligible'] for r in rows))
        self.assertEqual(len({r['sourceKey'] for r in rows}),4)
    def test_reject_changed_source_schema(self):
        with self.assertRaises(ValueError):parse(b'FDID,Unknown\n0012,Example\n',[],minimum=1)
