import unittest
from stage_illinois_cook_addresses import FIELDS,LAYER,ITEM,review,features,acquire
class CookTests(unittest.TestCase):
    def test_review_only_and_exact_identity(self):
        e={'key':'fixture','state':'IL','status':'no-match','sourceCounty':'17031','address':{'street':'123 Main Street','city':'Example','state':'IL','zip':'60601'}}
        a={k:None for k in FIELDS};a.update(OBJECTID=1,Add_Number=123,ADDRNOCOM='123',STNAMECOM='MAIN ST',Post_Comm='EXAMPLE',Post_Code='60601',State='IL',County='COOK COUNTY',Structure='Y',Placement='Rooftop',last_edited_date=1735689600000)
        f={'attributes':a,'geometry':{'x':-87.7,'y':41.9}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertFalse(hit['countyVerified'])
        for k,v in [('County','OTHER'),('Unit','2'),('Structure','N'),('Placement','Parcel'),('Post_Code','60602'),('last_edited_date',None)]:
            self.assertIsNone(review(e,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        self.assertIsNone(review({**e,'address':{**e['address'],'street':'123 Main Street STE 7'}},[f],'2026-11-25')[0])
        meta={'id':0,'name':'Address Points','serviceItemId':ITEM,'geometryType':'esriGeometryPoint','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        report=acquire([e,{**e,'key':'other','sourceCounty':'17097'},{**e,'key':'unknown','sourceCounty':''}],'2026-11-25',fetch=lambda u,p:meta if u==LAYER else payload,delay=0)
        self.assertEqual(report['counts'],{'candidate':1})
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
