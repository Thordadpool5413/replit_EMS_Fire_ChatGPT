import unittest
from stage_pennsylvania_bucks_addresses import FIELDS,LAYER,review,acquire,features
class BucksTests(unittest.TestCase):
    def test_review_scope(self):
        e={'key':'fixture','state':'PA','status':'no-match','sourceCounty':'42017','address':{'street':'123 Main Street','city':'Example','state':'PA','zip':'18901'}}
        a={k:None for k in FIELDS};a.update(OBJECTID=1,Full_Addr='123 MAIN ST',Post_Code='18901',Post_Comm='EXAMPLE',State='PA',Country='US',County='Bucks',Add_Number='123',Source='Fixture',Site_NGUID='fixture',DateUpdate=1735689600000,Placement='Structure')
        f={'attributes':a,'geometry':{'x':-75.1,'y':40.3}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertFalse(hit['countyVerified'])
        for k,v in [('County','Other'),('Unit','7'),('Source',None),('DateUpdate',None)]:
            self.assertIsNone(review(e,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        meta={'id':14,'name':'Bucks County - Site Address Points 202503','geometryType':'esriGeometryPoint','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        report=acquire([e,{**e,'key':'foreign','sourceCounty':'42019'}],'2026-11-25',fetch=lambda u,p:meta if u==LAYER else payload,delay=0)
        self.assertEqual(report['counts'],{'candidate':1})
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
