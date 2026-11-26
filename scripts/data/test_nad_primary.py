import copy,json,pathlib,tempfile,unittest
from unittest.mock import patch
import stage_nad_primary as nad

class NativeNadTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=pathlib.Path(self.temp.name)
        self.entry={'key':'FDID:AK:11100','name':'Example','source':'USFA','state':'AK','status':'no-match','sourceCounty':'02110','address':{'street':'820 Glacier AVE','city':'Juneau','state':'AK','zip':'99801'}}
        self.native={k:'' for k in nad.FIELDS}
        self.native.update(OID_='1',AddNo_Full='820',StNam_Full='Glacier Avenue',State='AK',Zip_Code='99801',Post_City='Juneau',County='Juneau',Placement='Structure - Rooftop',AddrClass='Numbered Thoroughfare Address',Lifecycle='Active',NAD_Source='State GIS',Latitude='58.30107',Longitude='-134.42169')
    def tearDown(self):self.temp.cleanup()
    def stage(self,rows=None,witnesses=None):
        rows=rows or [{'sourceRowNumber':1,'native':self.native}];witnesses=witnesses or rows
        receipt={'sourceArchiveSha256':nad.ARCHIVE_SHA,'targetsSha256':nad.target_digest([self.entry]),'addressScan':{'rowsScanned':nad.SOURCE_COUNT,'completeMemberVerified':True},'coordinateScan':{'rowsScanned':nad.SOURCE_COUNT,'completeMemberVerified':True},'retainedNativeRows':len(rows),'retainedCoordinateWitnesses':len(witnesses)}
        values={'native-matches.json':rows,'coordinate-witnesses.json':witnesses,'address-scan.json':receipt['addressScan'],'coordinate-scan.json':receipt['coordinateScan'],'coordinate-audit-counts.json':[]}
        for k,v in values.items():(self.path/k).write_bytes(nad.dump(v))
        receipt['files']={k:nad.sha((self.path/k).read_bytes()) for k in values}
        (self.path/'scan-receipt.json').write_bytes(nad.dump(receipt));return receipt
    def report(self):
        with patch.object(nad,'geometry_index',return_value={'AK':[]}),patch.object(nad,'county_for',return_value=('02110','test')):
            return nad.make_candidates(self.path,[self.entry],'0'*64)
    def test_retention_cannot_omit_hash_bindings(self):
        receipt=self.stage();receipt['files'].pop('native-matches.json');(self.path/'scan-receipt.json').write_bytes(nad.dump(receipt))
        with self.assertRaises(ValueError):nad.read_source(self.path)
    def test_native_city_and_zip_are_preserved(self):
        self.native['Post_City']='Different postal city';self.stage();candidate=self.report()['candidates'][0]
        self.assertEqual(candidate['match']['matchBasis'],'normalized-street-state-zip')
        self.assertEqual(candidate['match']['sourceAddress']['city'],'Different postal city')
        self.native['Post_City']='Juneau';self.native['Zip_Code']='';self.stage()
        match=self.report()['candidates'][0]['match'];self.assertEqual(match['matchBasis'],'normalized-street-city-state');self.assertEqual(match['sourceAddress']['zip'],'')
    def test_other_zip_at_same_coordinate_is_not_a_valid_address_point(self):
        other=copy.deepcopy(self.native);other.update(OID_='2',Zip_Code='99802')
        self.stage(witnesses=[{'sourceRowNumber':1,'native':self.native},{'sourceRowNumber':2,'native':other}])
        self.assertEqual(self.report()['candidates'],[])
    def test_source_status_and_county_conflicts_are_vetoes(self):
        inactive=copy.deepcopy(self.native);inactive.update(OID_='2',Lifecycle='Retired')
        self.stage(rows=[{'sourceRowNumber':1,'native':self.native},{'sourceRowNumber':2,'native':inactive}])
        self.assertEqual(self.report()['candidates'],[])
        self.entry['sourceCounty']='02020';self.stage();self.assertEqual(self.report()['candidates'],[])
    def test_authority_falls_back_without_filling_native_fields(self):
        self.native.update(NAD_Source='  ',AddAuth='Municipal GIS');self.stage()
        self.assertEqual(self.report()['candidates'][0]['match']['point']['authority'],'Municipal GIS')
    def test_changed_number_or_route_authority_never_matches(self):
        self.entry['address']['street']='821 Glacier Ave';self.stage();self.assertEqual(self.report()['candidates'],[])
        self.native.update(AddNo_Full='123',StNam_Full='US Route 6');self.entry['address']['street']='123 State Route 6';self.stage();self.assertEqual(self.report()['candidates'],[])

if __name__=='__main__':unittest.main()
