import unittest
from stage_michigan_midland_addresses import SERVICE,URL,ITEM,FIELDS,metadata,features,query,review,acquire,in_scope
class MidlandTest(unittest.TestCase):
    def test_exact_municipal_review(self):
        svc={'serviceItemId':ITEM,'copyrightText':'City of Midland Michigan','layers':[{'id':1,'name':'Address Points'}]}
        layer={'id':1,'name':'Address Points','geometryType':'esriGeometryPoint','objectIdField':'OBJECTID','fields':[{'name':k,'type':v,**({'domain':{'codedValues':[{'code':s} for s in ('Active','Pending','Retired')]}} if k=='Status' else {})} for k,v in FIELDS.items()]}
        e={'key':'fixture','state':'MI','sourceCounty':'26111','status':'no-match','address':{'street':'123 Main Street','city':'Midland','state':'MI','zip':'48640'}}
        a={'OBJECTID':1,'STNUM':'123','ADDRESS':'123 MAIN ST','UNIT':'','CITY':'MIDLAND','State':'MI','ZIP':'48640','Status':'Active'}
        f={'attributes':a,'geometry':{'x':-84.24,'y':43.62}}
        payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload));self.assertEqual(d['status'],'candidate');self.assertFalse(hit['countyVerified']);self.assertTrue(hit['endUserValidationRequired']);self.assertEqual(e['status'],'no-match')
        self.assertIn("STNUM='123'",query(e['address'])['where'])
        for field,value in [('UNIT','7'),('Status','Retired'),('ADDRESS','124 MAIN ST'),('ZIP','00000')]:
            bad={**f,'attributes':{**a,field:value}}
            self.assertIsNone(review(e,features({**payload,'features':[bad]}))[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}])[0])
        self.assertFalse(in_scope({**e,'sourceCounty':'26001','address':{**e['address'],'city':'Other'}}))
        with self.assertRaises(ValueError):features({**payload,'features':[f,f]})
        with self.assertRaises(ValueError):metadata(lambda u,p:{**svc,'serviceItemId':'bad'} if u==SERVICE else layer)
        report=acquire([e], '2026-11-25',fetch=lambda u,p:svc if u==SERVICE else layer if u==URL else payload)
        self.assertEqual(report['counts'],{'candidate':1});self.assertEqual(report['publication'],'review-only')
