import unittest
from stage_ohio_trumbull_addresses import FIELDS,LAYER,SERVICE,ITEM,review,features,acquire
class TrumbullTests(unittest.TestCase):
    def test_exact_review_only(self):
        e={'key':'fixture','state':'OH','status':'no-match','sourceCounty':'39155','address':{'street':'123 Main Street','city':'Example','state':'OH','zip':'44481'}}
        a={k:None for k in FIELDS};a.update(OBJECTID=1,FEATUREID=42,HOUSENUM=123,LHN='123',LSN='MAIN ST',ZIPCODE='44481',USPS_CITY='EXAMPLE',STATE='OH',COUNTY='TRUMBULL',SOURCE=1,DATEMODIFI=1735689600000)
        f={'attributes':a,'geometry':{'x':-80.8,'y':41.25}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertFalse(hit['countyVerified']);self.assertIsNone(hit['placementAsReported'])
        for k,v in [('COUNTY','OTHER'),('UNITNUM','2'),('FEATUREID',None),('SOURCE',None),('DATEMODIFI',None),('LHN','124')]:
            self.assertIsNone(review(e,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        meta={'id':0,'name':'Address Points','serviceItemId':ITEM,'geometryType':'esriGeometryPoint','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        service={'serviceItemId':ITEM,'copyrightText':'Trumbull County, OH; Bruce Harris & Associates, Inc.','layers':[{'id':0,'name':'Address Points'}]}
        report=acquire([e,{**e,'key':'other','sourceCounty':'39049'}],'2026-11-25',fetch=lambda u,p:service if u==SERVICE else meta if u==LAYER else payload,delay=0)
        self.assertEqual(report['counts'],{'candidate':1})
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
