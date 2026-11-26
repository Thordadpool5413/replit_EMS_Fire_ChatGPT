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

    def test_malformed_quote_isolated_and_later_records_retained(self):
        header=','.join(FIELDS)+'\n'
        rows='0012,TX,Station A,TX,123 Main St,,Example,75001\n0012,TX,"broken"tail,TX,123 Main St,,Example,75001\n0012,TX,Station B,TX,124 Main St,,Example,75001\n0012,TX,wrong-width\n'
        records,counts,audit=parse((header+rows).encode(),[],minimum=1,with_audit=True)
        self.assertEqual([r['stationNameAsReported'] for r in records],['Station A','Station B'])
        self.assertEqual(counts['sourceRows'],4)
        self.assertEqual(counts['malformedCsvRecords'],2)
        self.assertEqual([a['reason'] for a in audit],['malformed-csv','column-count-mismatch'])
        self.assertEqual([a['firstPhysicalLine'] for a in audit],[3,5])
        self.assertTrue(all(len(a['fragmentSha256'])==64 for a in audit))
        self.assertNotIn('broken',str(audit))
    def test_valid_multiline_not_reinterpreted_as_separate_row(self):
        header=','.join(FIELDS)+'\n'
        raw=header+'0012,TX,"Station\nA",TX,123 Main St,,Example,75001\n'
        rows,counts,audit=parse(raw.encode(),[],minimum=1,with_audit=True)
        self.assertEqual(rows[0]['stationNameAsReported'],'Station A')
        self.assertEqual(counts['sourcePhysicalLines'],3)
        self.assertEqual(audit,[])
