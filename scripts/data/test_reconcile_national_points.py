import unittest,copy
from reconcile_national_points import reconcile
def entry():
 return dict(key='FDID:NY:1',status='no-match',address={'street':'1 Main St'},match=None,countyFips='')
def mapped(e,method,lat=42.0):
 return dict(e,status='mapped',countyFips='36001',match=dict(method=method,latitude=lat,longitude=-73.0))
class ReconcileTests(unittest.TestCase):
 def test_deduplicates_and_preserves_base(self):
  e=entry();old=dict(mapped(e,'census-address-range'),key='old');base={e['key']:e,'old':old}
  nad=mapped(e,'nad-address-point');ny=mapped(e,'ny-sam-address-point',42.00001)
  result,s,_=reconcile(base,{'nad':{e['key']:nad,'old':old},'ny':{e['key']:ny,'old':old}})
  self.assertEqual(result,[ny,old]);self.assertEqual(s['new_mapped'],1);self.assertEqual(s['overlap'],1)
 def test_conflicting_points_withheld(self):
  e=entry();r,s,c=reconcile({e['key']:e},{'nad':{e['key']:mapped(e,'nad-address-point')},'ny':{e['key']:mapped(e,'ny-sam-address-point',43)}})
  self.assertEqual(r,[e]);self.assertEqual(s['conflicts_withheld'],1)
 def test_reject_address_rewrite(self):
  e=entry();m=mapped(e,'nad-address-point');m['address']={'street':'2 Main St'}
  with self.assertRaises(ValueError):reconcile({e['key']:e},{'nad':{e['key']:m}})
if __name__=='__main__':unittest.main()
