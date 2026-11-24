import copy,csv,io,unittest
from recover_census_locations import parse_retry,query_address,recover
A={'street':'123 Main Street, Suite 2','city':'Example','state':'FL','zip':'32901'}
def encode(rows):
 s=io.StringIO();csv.writer(s).writerows(rows);return s.getvalue()
ROW=['1','input','Match','Non_Exact','123 MAIN ST, EXAMPLE, FL, 32901','-80.6,28.1','1','L','12','009','000100','1000']
class CensusRetryTests(unittest.TestCase):
 def test_normalization_preserves_source(self):
  self.assertEqual(query_address(A),['123 MAIN ST','EXAMPLE','FL','32901']);self.assertEqual(A['street'],'123 Main Street, Suite 2')
 def test_non_exact_flag_requires_exact_address_and_county(self):
  out,flags=parse_retry(encode([ROW]),{'1':A},{'FL':'12'},{'12009'})
  self.assertEqual(out['1'][0],'mapped');self.assertEqual(flags['1'],'Non_Exact')
  for i,value in [(4,'124 MAIN ST, EXAMPLE, FL, 32901'),(4,'123 MAIN ST, OTHER, FL, 32901'),(4,'123 MAIN ST, EXAMPLE, FL, 32902'),(3,'Tie'),(8,'13'),(5,'NaN,28')]:
   bad=ROW.copy();bad[i]=value
   self.assertEqual(parse_retry(encode([bad]),{'1':A},{'FL':'12'},{'12009'})[0]['1'][0],'no-match')
  with self.assertRaises(ValueError):parse_retry(encode([ROW,ROW]),{'1':A},{'FL':'12'},{'12009'})
 def test_only_unresolved_physical_addresses_and_matching_county(self):
  old={'key':'old','state':'FL','status':'mapped','address':A,'sourceCounty':'12009','match':{'method':'census-address-range'}}
  new={'key':'new','state':'FL','status':'no-match','address':A,'sourceCounty':'12009','match':None,'countyFips':''}
  conflict={**new,'key':'conflict','sourceCounty':'12011'}
  before=copy.deepcopy(old);stats=recover([old,new,conflict],{'FL'},{'FL':'12'},{'12009','12011'},fetch=lambda _:encode([ROW]))
  self.assertEqual(old,before);self.assertEqual(new['status'],'mapped');self.assertEqual(conflict['status'],'no-match');self.assertEqual(stats['mapped'],1);self.assertEqual(stats['county_conflict'],1)
if __name__=='__main__':unittest.main()
