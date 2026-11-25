import copy,unittest
from stage_neris_stations import reconcile,retrieve
def dept(key='FD123',state='FL'):
 return {'attributes':{'neris_id':key,'name':'CI department','state':state,'station_count':1}}
def station(key='ST123',parent='FD123',state='GA'):
 return {'attributes':{'neris_id':key,'department_neris_id':parent,'state':state,'station_name':'CI station','address_line_1':'123 Main St','city':'Example','zip_code':'30001'},'geometry':{'x':-84.1,'y':33.2}}
class StationStageTests(unittest.TestCase):
 def test_exact_parent_cross_state_and_counts(self):
  r=reconcile([dept()],[station()],{'FL'})
  self.assertEqual(r['summary']['eligibleStations'],1)
  self.assertEqual(r['summary']['crossStateStations'],1)
  self.assertEqual(r['summary']['sourceCoordinates'],1)
  self.assertTrue(r['stations'][0]['endUserValidationRequired'])
  for rows in ([station(),station('st123')],[station(parent='OTHER')],[station('FD123')]):
   self.assertEqual(reconcile([dept()],rows,{'FL'})['summary']['eligibleStations'],0)
  self.assertEqual(reconcile([dept(),dept()],[station()],{'FL'})['summary']['eligibleStations'],0)
 def test_no_coordinates_inferred(self):
  f=station();f['geometry']={'x':0,'y':0};f['attributes']['address_line_1']='PO Box 123'
  r=reconcile([dept()],[f],{'FL'})
  self.assertIsNone(r['stations'][0]['coordinates'])
  self.assertFalse(r['stations'][0]['physicalStreetFormat'])
 def test_incomplete_object_batch_rejected(self):
  def fetch(layer,p):
   if p.get('returnIdsOnly'):return {'objectIdFieldName':'OBJECTID','objectIds':[1,2]}
   return {'features':[{'attributes':{'OBJECTID':1}}]}
  with self.assertRaises(ValueError):retrieve(1,'state=FL',('OBJECTID',),fetch)
