import unittest
from stage_neris_national_stations import batch,inventory,build,DEPT,STATION
class NationalNerisTests(unittest.TestCase):
    def row(self,fields,**kw):
        return {'attributes':{**dict.fromkeys(fields),**kw},'geometry':{'x':-84.1,'y':33.2}}
    def test_native_relationships_and_coordinate_sharing(self):
        d=self.row(DEPT,OBJECTID=1,neris_id='FD123',name='Fixture EMS',state='FL',station_count=2)
        a=self.row(STATION,OBJECTID=2,neris_id='ST123',department_neris_id='FD123',department_name='Fixture EMS',station_name='Fixture 1',state='GA',address_line_1='123 Main St',city='Example',zip_code='30001')
        b=self.row(STATION,OBJECTID=3,neris_id='ST124',department_neris_id='FD123',department_name='Different',state='GA',address_line_1='123 Main St',city='Example',zip_code='30001')
        report=build([d],[a,b])
        self.assertEqual(report['summary']['eligibleStations'],2)
        self.assertEqual(report['summary']['crossStateStations'],2)
        self.assertEqual(report['summary']['distinctStationSourcePoints'],1)
        self.assertEqual(report['summary']['sharedStationCoordinateRows'],2)
        self.assertEqual(report['summary']['parentNameConflicts'],1)
        self.assertFalse(report['stations'][0]['publicationEligible'])
        self.assertEqual(report['stations'][0]['sourceObjectId'],2)
        self.assertEqual(build([d],[a,a])['summary']['eligibleStations'],0)
    def test_inventory_and_geometry(self):
        def fetch(layer,p):
            return {'count':2} if p.get('returnCountOnly') else {'objectIdFieldName':'OBJECTID','objectIds':[1,1]}
        with self.assertRaises(ValueError):inventory(0,fetch)
        fields={'OBJECTID':'esriFieldTypeOID'}
        p={'features':[{'attributes':{'OBJECTID':1},'geometry':{'x':-84,'y':33}}],'spatialReference':{'wkid':4326}}
        self.assertEqual(set(batch(1,p,[1],fields)),{1})
        with self.assertRaises(ValueError):batch(1,p,[2],fields)
        with self.assertRaises(ValueError):batch(1,{**p,'spatialReference':{'wkid':3857}},[1],fields)

    def test_malformed_source_fields_isolated_without_repairing_identity(self):
        fields={'OBJECTID':'esriFieldTypeOID','neris_id':'esriFieldTypeString','name':'esriFieldTypeString','state':'esriFieldTypeString'}
        p={'features':[{'attributes':{'OBJECTID':1,'neris_id':'FD123','name':'Fixture\r\nEMS','state':'FL'},'geometry':{'x':-84,'y':33}},{'attributes':{'OBJECTID':2,'neris_id':'FD\n124','name':'Bad\x00name','state':'FL'},'geometry':{'x':999,'y':33}}],'spatialReference':{'wkid':4326}}
        rows=batch(0,p,[1,2],fields)
        self.assertEqual(rows[1]['attributes']['name'],'Fixture EMS')
        self.assertEqual(rows[1]['attributes']['neris_id'],'FD123')
        self.assertIsNone(rows[2]['attributes']['neris_id'])
        self.assertIsNone(rows[2]['attributes']['name'])
        self.assertIsNone(rows[2]['geometry'])
        self.assertEqual(len(rows[2]['sourceFieldIssues']),3)
        self.assertEqual(set(rows),{1,2})
        self.assertTrue(all(len(i['sourceValueSha256'])==64 for r in rows.values() for i in r['sourceFieldIssues']))
    def test_withheld_native_objects_accounted_for(self):
        d=self.row(DEPT,OBJECTID=1,neris_id='FD123',name='Fixture EMS',state='FL',station_count=1)
        a=self.row(STATION,OBJECTID=2,neris_id='ST123',department_neris_id='FD123',state='GA')
        b=self.row(STATION,OBJECTID=3,neris_id=None,department_neris_id='FD123',state='GA')
        b['sourceFieldIssues']=[{'field':'neris_id','reason':'malformed-native-field-withheld','sourceValueSha256':'a'*64}]
        result=build([d],[a,b])
        self.assertEqual(result['summary']['eligibleStations'],1)
        self.assertEqual(result['summary']['withheldObjectAuditRows'],1)
        self.assertEqual(result['summary']['sourceObjectsWithFieldIssues'],1)
        self.assertEqual(result['sourceObjectAudit'][0]['sourceObjectId'],3)
