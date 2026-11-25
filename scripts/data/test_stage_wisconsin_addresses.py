import tempfile,pathlib,unittest
from stage_wisconsin_addresses import ITEM,FIELDS,layer_url,schema,features,review,query,acquire
from recover_nad_locations import county_index
class WisconsinTest(unittest.TestCase):
    def test_pinned_item_schema_and_exact_review(self):
        item={'id':ITEM,'title':'WI NG911 Site Structure Address Points','type':'Feature Service','access':'public','url':'https://services1.arcgis.com/Fixture/arcgis/rest/services/Fixture/FeatureServer'}
        layer={'serviceItemId':ITEM,'id':0,'geometryType':'esriGeometryPoint','objectIdField':'OBJECTID','fields':[{'name':k,'type':v} for k,v in {**FIELDS,'OBJECTID':'esriFieldTypeOID'}.items()]}
        names=schema(layer)
        e={'key':'fixture','state':'WI','sourceCounty':'55025','status':'no-match','address':{'street':'123 Main Street','city':'Madison','state':'WI','zip':'53703'}}
        a=dict.fromkeys(FIELDS);a.update(Add_Number=123,FullStNm='MAIN ST',Post_Comm='MADISON',Post_Code='53703',State='WI',Country='US',County='Dane County',Placement='Structure',OBJECTID=1)
        row={'attributes':a,'geometry':{'x':-89.4,'y':43.07}}
        payload={'features':[row],'spatialReference':{'wkid':4326}}
        counties=county_index([{'USPS':'WI','NAME':'Dane County','GEOID':'55025'}])
        hit,status=review(e,features(payload,names),counties,'2026-11-25')
        self.assertEqual(status,'candidate');self.assertTrue(hit['endUserValidationRequired']);self.assertEqual(e['status'],'no-match')
        self.assertIn("Add_Number=123",query([e['address']],names)['where'])
        for field,value in [('County','Other'),('Placement','Geocoding'),('Unit','7'),('FullStNm','OTHER ST')]:
            bad={**row,'attributes':{**a,field:value}}
            self.assertIsNone(review(e,features({**payload,'features':[bad]},names),counties,'2026-11-25')[0])
        with self.assertRaises(ValueError):layer_url({**item,'url':'https://example.com/FeatureServer'})
        with self.assertRaises(ValueError):schema({**layer,'serviceItemId':'other'})
        with self.assertRaises(ValueError):features({**payload,'features':[row,row]},names)
        with tempfile.TemporaryDirectory() as td:
            report=acquire([e],counties,'2026-11-25',pathlib.Path(td),fetch=lambda url,p: item if 'sharing/rest' in url else payload if url.endswith('/query') else layer,delay=0)
            self.assertEqual(report['counts'],{'candidate':1});self.assertEqual(report['publication'],'review-only')
