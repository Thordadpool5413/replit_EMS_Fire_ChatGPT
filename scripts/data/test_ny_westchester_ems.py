import unittest,html
from stage_ny_westchester_ems import HEADER,parse,reconcile
def fixture(rows):
    return '<table><thead><tr>'+''.join('<th>'+html.escape(x)+'</th>' for x in HEADER)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
def row(name,code):
    return [name,'private-phone','123 Main St','Example','NY','10501','example.invalid','private-contact','title','other-contact','title',code]
class RegionalRosterTests(unittest.TestCase):
    def test_conflicting_and_missing_codes_preserved(self):
        rows=parse(fixture([row('Example EMS','0012'),row('Another EMS','0012'),row('Third EMS','751'),row('Fourth EMS',''),row('Fifth EMS','0013')]),minimum=5)
        self.assertEqual([r['agencyCodeStatus'] for r in rows],['duplicate','duplicate','non-four-digit','missing','unique-as-reported'])
        self.assertEqual(rows[0]['agencyCodeAsReported'],'0012')
        self.assertEqual(len({r['reviewKey'] for r in rows}),5)
        self.assertNotIn('private-contact',str(rows));self.assertNotIn('private-phone',str(rows))
        self.assertFalse(rows[-1]['publicationEligible'])
        national=[['usfa:NY:0013','USFA','Fifth EMS','NY','Example','10501','','','','','',''],['usfa:NY:0012','USFA','Example EMS','NY','Example','10501','','','','','','']]
        results=reconcile(rows,national)
        self.assertEqual(results[0]['nationalReviewCandidates'],[])
        self.assertEqual(results[-1]['nationalReviewCandidates'][0]['sourceKey'],'FDID:NY:0013')
        self.assertNotIn('countyFips',results[-1]);self.assertNotIn('latitude',results[-1])
    def test_reject_changed_schema(self):
        with self.assertRaises(ValueError):parse(fixture([row('Example','0012')]).replace('Headquarters Street','Unknown'),minimum=1)
        with self.assertRaises(ValueError):parse(fixture([row('Example','0012')[:-1]]),minimum=1)
