import unittest
from plan_national_recovery import build_queue
from stage_california_la_addresses import URL,LAYER,ITEM,FIELDS,acquire,review,features
class NationalRecoveryTest(unittest.TestCase):
    def fixture(self,key='FDID:CA:fixture',county='06037',status='no-match'):
        return {'key':key,'state':'CA','source':'USFA','sourceCounty':county,'countyFips':'','status':status,'match':None,'address':{'street':'123 Main Street','city':'Los Angeles','state':'CA','zip':'90001'}}
    def test_priority_counts_and_scope(self):
        a=self.fixture();b=self.fixture('NPI:fixture','');c=self.fixture('mapped','06037','mapped');c['countyFips']='06037'
        q=build_queue([a,b,c]);self.assertEqual(q['actionableRecords'],2);self.assertEqual(q['distinctAddressTargets'],1)
        la=next(r for r in q['adapterTargets'] if r['adapter']=='ca-la-cams')
        self.assertEqual(la['inScopeRecords'],1);self.assertEqual(la['unassignedCountyRecordsForResearch'],1)
        with self.assertRaises(ValueError):build_queue([a,a])
    def test_la_exact_review_only(self):
        e=self.fixture();a={k:None for k in FIELDS};a.update(OBJECTID=1,Number='123',FullName='MAIN ST',FullAddress='123 MAIN ST',ZipCode='90001',LegalComm='LOS ANGELES',Source='City fixture',SourceID='abc',UniqueID='fixture-1',UpdateDate=1735689600000)
        f={'attributes':a,'geometry':{'x':-118.2,'y':34.0}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertFalse(hit['countyVerified'])
        for k,v in [('UnitName','7'),('FullAddress','124 MAIN ST'),('SourceID',None),('UpdateDate',None)]:
            bad={**f,'attributes':{**a,k:v}};self.assertIsNone(review(e,[bad],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        self.assertIsNone(review({**e,'address':{**e['address'],'street':'123 Main Street STE 2'}},[f],'2026-11-25')[0])
        service={'serviceItemId':ITEM,'layers':[{'id':0,'name':'CAMS_ADDRESS_POINTS'}]}
        layer={'id':0,'name':'CAMS_ADDRESS_POINTS','objectIdField':'OBJECTID','geometryType':'esriGeometryPoint','copyrightText':'County of Los Angeles','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        result=acquire([e,self.fixture('foreign','06059')],'2026-11-25',fetch=lambda u,p:service if u==URL else layer if u==LAYER else payload,delay=0)
        self.assertEqual(result['counts'],{'candidate':1});self.assertEqual(result['publication'],'review-only')
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
