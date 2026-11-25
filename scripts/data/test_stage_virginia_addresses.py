import unittest
from stage_virginia_addresses import review,query,features,acquire,FIELDS,ITEM
class VirginiaAddressTest(unittest.TestCase):
    def test_exact_review_only(self):
        e={'key':'fixture','state':'VA','status':'no-match','sourceCounty':'51059','address':{'street':'123 Main Street','city':'Fairfax','state':'VA','zip':'22030'}}
        f={'attributes':{'OBJECTID':1,'ADDRNUM':'123','FULLADDR':'123 MAIN ST','PO_NAME':'FAIRFAX','STATE':'VA','ZIP_5':22030,'FIPS':'51059','MUNICIPALITY':'Fairfax County','POINTTYPE':'Building','CAPTUREMETH':'GPS','STATUS':'Current','LASTUPDATE':None},'geometry':{'x':-77.3,'y':38.8}}
        from recover_nad_locations import county_index
        counties=county_index([{'USPS':'VA','NAME':'Fairfax County','GEOID':'51059'}])
        hit,status=review(e,[f],counties,'2026-11-25')
        self.assertEqual(status,'candidate');self.assertTrue(hit['endUserValidationRequired']);self.assertEqual(e['status'],'no-match')
        self.assertEqual(review(e,[f,{**f,'attributes':{**f['attributes'],'OBJECTID':2}}],counties,'2026-11-25')[1],'review')
        self.assertEqual(review(e,[{**f,'attributes':{**f['attributes'],'FIPS':'51061'}}],counties,'2026-11-25')[1],'review')
        self.assertIn("ADDRNUM='123'",query([e['address']])['where'])
        with self.assertRaises(ValueError):features({'features':[f,f],'spatialReference':{'wkid':4326}})
        meta={'serviceItemId':ITEM,'name':'Address_Points','geometryType':'esriGeometryPoint','copyrightText':'Virginia Geographic Information Network (VGIN)','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        result=acquire([e],counties,'2026-11-25',fetch=lambda p,q=False: {'features':[f],'spatialReference':{'wkid':4326}} if q else meta,delay=0)
        self.assertEqual(result['counts'],{'candidate':1});self.assertEqual(result['publication'],'review-only')
