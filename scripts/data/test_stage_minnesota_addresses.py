import unittest
from stage_minnesota_addresses import URL,ITEM,FIELDS,metadata,query,features,review,acquire
from recover_nad_locations import county_index
class MinnesotaTest(unittest.TestCase):
    def test_exact_source_bound_review(self):
        m={'serviceItemId':ITEM,'name':'Loc Addresses Open','id':0,'geometryType':'esriGeometryPoint','objectIdField':'objectid','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        e={'key':'fixture','state':'MN','sourceCounty':'27053','status':'no-match','address':{'street':'123 Main Street','city':'Example','state':'MN','zip':'55401'}}
        a=dict.fromkeys(FIELDS);a.update(objectid=1,add_id='fixture',anumber=123,st_name='MAIN',st_pos_typ='ST',postcomm='EXAMPLE',zip='55401',state_code='MN',co_code='27053',co_name='Hennepin County',aauthority='Fixture authority')
        f={'attributes':a,'geometry':{'x':-93.26,'y':44.98}}
        payload={'features':[f],'spatialReference':{'wkid':4326}}
        counties=county_index([{'USPS':'MN','NAME':'Hennepin County','GEOID':'27053'}])
        hit,d=review(e,features(payload),counties,'2026-11-25')
        self.assertEqual(d['status'],'candidate');self.assertTrue(hit['endUserValidationRequired']);self.assertEqual(e['status'],'no-match')
        self.assertIn("anumber=123",query([e['address']])['where'])
        for field,value,reason in [('co_code','27001','county_conflict'),('sub_id1','7','subaddress'),('aauthority',None,'missing_source_authority')]:
            bad={**f,'attributes':{**a,field:value}}
            hit,d=review(e,features({**payload,'features':[bad]}),counties,'2026-11-25')
            self.assertIsNone(hit);self.assertIn(reason,d['reasons'])
        self.assertEqual(review(e,[],counties,'2026-11-25')[1]['status'],'noMatch')
        with self.assertRaises(ValueError):features({**payload,'features':[f,f]})
        with self.assertRaises(ValueError):metadata(lambda u,p:{**m,'serviceItemId':'other'})
        report=acquire([e],counties,'2026-11-25',fetch=lambda u,p:payload if u.endswith('/query') else m,delay=0)
        self.assertEqual(report['counts'],{'candidate':1});self.assertEqual(report['publication'],'review-only')
