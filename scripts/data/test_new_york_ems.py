import unittest
from stage_new_york_ems import parse_codes,inspect_county_pages,SOURCES
class NYRosterTests(unittest.TestCase):
    def test_exact_code_and_wrapped_name(self):
        p=SOURCES['agency-codes']['title']+'\nExample Ambulance (DBA)\n  (Other DBA) (0012)\nExample Fire (0999)\n'
        rows=parse_codes([p],minimum=2)
        self.assertEqual(rows[0]['identifier'],'0012')
        self.assertEqual(rows[0]['nameAsReported'],'Example Ambulance (DBA) (Other DBA)')
        self.assertFalse(rows[0]['publicationEligible'])
        self.assertNotIn('address',rows[0]);self.assertNotIn('latitude',rows[0])
        with self.assertRaises(ValueError):parse_codes([p+'Duplicate (0012)\n'],minimum=2)
        with self.assertRaises(ValueError):parse_codes([p+'Unfinished name\n'],minimum=2)
    def test_county_layout_not_station_assignment(self):
        k='ambulance-als';s=SOURCES[k]
        pages=[s['title']+'\nService Name     Service ID   Mailing Address   License Type\nCounty of Albany\nNYS-EMS  Page '+str(i)+' of 151    8/8/24' for i in range(1,152)]
        r=inspect_county_pages(k,pages)
        self.assertEqual(r['parsedOrganizationCount'],0)
        self.assertEqual(r['sourceDate'],'2024-08-08')
        self.assertEqual(r['countyLabels'],['Albany'])
        with self.assertRaises(ValueError):inspect_county_pages(k,pages[:-1])
        with self.assertRaises(ValueError):inspect_county_pages(k,[pages[0].replace('Service ID','Unknown'),*pages[1:]])
