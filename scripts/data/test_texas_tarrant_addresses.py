import unittest
from stage_texas_tarrant_addresses import FIELDS,LAYER,ITEM,review,features,acquire,query
from investigate_address_exceptions import SOURCES
class TarrantTests(unittest.TestCase):
    def test_exact_address_and_review_guards(self):
        e={'key':'fixture','state':'TX','status':'no-match','sourceCounty':'48439','address':{'street':'123 Main Street','city':'Example','state':'TX','zip':'76248'}}
        a={k:None for k in FIELDS};a.update(FID=1,SITE_ID=17,HOUSE_NUM=123,ROADNAME='MAIN ST',ADDRESS='123 MAIN ST',POSTAL_NAM='EXAMPLE',ZIP_CODE='76248',STATE='TX',COUNTY_NAM='TARRANT',CNTY_FIPS='48439',DATASOURCE='Test',UPDATE_DAT=1735689600000)
        f={'attributes':a,'geometry':{'x':-97.2,'y':32.9}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        self.assertNotIn('resultRecordCount',query([e['address']]))
        with self.assertRaises(ValueError):query([e['address']]*2)
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertIsNone(hit['placementAsReported'])
        for k,v in [('CNTY_FIPS','48113'),('UNIT','2'),('FLAG',1),('EXCEPTION',1),('SITE_ID',None),('ADDRESS','124 MAIN ST'),('UPDATE_DAT',None)]:
            self.assertIsNone(review(e,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'FID':2}}],'2026-11-25')[0])
        meta={'id':1,'name':'TC911 Address Points','serviceItemId':ITEM,'geometryType':'esriGeometryPoint','fields':[{'name':k,'type':v} for k,v in FIELDS.items()]}
        report=acquire([e,{**e,'key':'foreign','sourceCounty':'48113'}],'2026-11-25',fetch=lambda u,p:meta if u==LAYER else payload,delay=0)
        self.assertEqual(report['counts'],{'candidate':1})
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
    def test_cook_original_scope(self):
        self.assertEqual(SOURCES['IL'][4:6],(8,'subaddress_or_exception'))
