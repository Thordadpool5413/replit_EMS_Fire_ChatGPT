import copy,csv,io,pathlib,tempfile,unittest,zipfile
from recover_ny_locations import query,resolve,recover
from recover_nad_bulk_locations import scan,FIELDS,validate_scan_result
from recover_nad_locations import county_index
A={'street':'30 School RD','city':'Guilderland Center','state':'NY','zip':'12085'}
C=county_index([{'USPS':'NY','NAME':'Albany','GEOID':'36001'},{'USPS':'NY','NAME':'Schenectady','GEOID':'36093'}])
F={'attributes':{'OBJECTID':1,'NYSAddressPointID':'123456','AddressNumber':30,'AddressLabel':'30 School Road','ZipCode':'12085','ZipName':'Guilderland Center','State':'NY','CountyName':'Albany','Status':'Active','PointType':'1','PrimaryPoint':'Y','AddressSource':'County AP','SubAddress':None,'AP_Flag':None},'geometry':{'x':-73.95,'y':42.7}}
def record(status='no-match'):
 return {'key':'FDID:NY:01015','state':'NY','status':status,'address':dict(A),'sourceCounty':'36001','countyFips':'','match':None}
class RecoveryTests(unittest.TestCase):
 def test_ny_exact_and_source_conflicts(self):
  hit,status=resolve(A,[F],C,'36001','2026-11-20')
  self.assertEqual(status,'mapped');self.assertEqual(hit[1]['point']['nativeId'],'123456')
  self.assertIn("AddressNumber=30 AND ZipCode='12085'",query([A])['where'])
  for field,value in [('AddressLabel','31 School Road'),('ZipName','Other'),('ZipCode','12086'),('CountyName','Schenectady'),('State','NJ'),('PrimaryPoint','N'),('PointType','5'),('Status','Retired')]:
   bad=copy.deepcopy(F);bad['attributes'][field]=value
   self.assertIsNone(resolve(A,[bad],C,'36001','2026-11-20')[0])
  bad=copy.deepcopy(F);bad['attributes']['OBJECTID']=2;bad['geometry']['x']=-73.96
  self.assertEqual(resolve(A,[F,bad],C,'36001','2026-11-20')[1],'ambiguous')
 def test_ny_preserves_existing_mapping(self):
  old=record('mapped');old['key']='old';new=record();before=copy.deepcopy(old)
  result=recover([old,new],C,'2026-11-20',1,0,lambda *_:{'features':[F],'spatialReference':{'wkid':4326}})
  self.assertEqual(old,before);self.assertEqual(result['mapped'],1)
 def test_bulk_scans_complete_file_and_retains_only_exact_targets(self):
  row={'OID_':'5','AddNo_Full':'30','StNam_Full':'School Road','State':'NY','Zip_Code':'12085','Post_City':'Guilderland Center','Inc_Muni':'Guilderland','County':'Albany','Placement':'Structure - Rooftop','AddrClass':'Numbered Thoroughfare Address','Lifecycle':'Active','NAD_Source':'New York State GIS','AddAuth':'Albany','Latitude':'42.7','Longitude':'-73.95'}
  with tempfile.TemporaryDirectory() as d:
   archive=pathlib.Path(d)/'nad.zip'
   def write(rows):
    txt=io.StringIO();w=csv.DictWriter(txt,fieldnames=FIELDS);w.writeheader();w.writerows(rows)
    with zipfile.ZipFile(archive,'w') as z:z.writestr('nad.txt',txt.getvalue())
   write([row,{**row,'OID_':'6','AddNo_Full':'31'}])
   target=record();old=record('mapped');old['key']='old';before=copy.deepcopy(old)
   stats=scan(archive,[target,old],C,minimum_member_bytes=1)
   self.assertEqual(stats['rowsScanned'],2);self.assertEqual(stats['mapped'],1);self.assertEqual(old,before);self.assertEqual(target['match']['point']['dataset'],'bulk-r24')
   write([row,{**row,'OID_':'6','Longitude':'-73.96'}])
   target=record();stats=scan(archive,[target],C,minimum_member_bytes=1)
   self.assertEqual(stats['ambiguous'],1);self.assertEqual(target['status'],'no-match')
   write([row,row]);self.assertRaises(ValueError,scan,archive,[record()],C,minimum_member_bytes=1)
 def test_complete_zero_gain_is_not_an_outage(self):
  self.assertFalse(validate_scan_result({'rowsScanned':99226272,'no-match':100},allow_empty=True))
  self.assertTrue(validate_scan_result({'rowsScanned':99226272,'mapped':1},allow_empty=True))
  with self.assertRaises(ValueError):validate_scan_result({'rowsScanned':5,'mapped':1},allow_empty=True)
  with self.assertRaises(ValueError):validate_scan_result({'rowsScanned':99226272})
if __name__=='__main__':unittest.main()
