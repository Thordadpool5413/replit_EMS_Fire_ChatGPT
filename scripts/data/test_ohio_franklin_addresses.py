import unittest
from stage_ohio_franklin_addresses import FIELDS,LAYER,ITEM,review,features,acquire
class FranklinTests(unittest.TestCase):
    def test_exact_certified_source_review(self):
        e={'key':'fixture','state':'OH','status':'no-match','sourceCounty':'39049','address':{'street':'123 Main Street','city':'Example','state':'OH','zip':'43215'}}
        a={k:None for k in FIELDS};a.update(OBJECTID=1,ADDR_ID=17.0,ADDR_NUM='123',STR_NAME='MAIN',STR_TYPE='ST',USPS_CITY='EXAMPLE',ZIP='43215',STATE='OH',COUNTY='FRA',STATUS=6,STRUC_TYPE=1,LAST_EDIT_DATE=1735689600000)
        f={'attributes':a,'geometry':{'x':-83.0,'y':40.0}};payload={'features':[f],'spatialReference':{'wkid':4326}}
        hit,d=review(e,features(payload),'2026-11-25');self.assertEqual(d['status'],'candidate');self.assertFalse(hit['publicationEligible']);self.assertIsNone(hit['placementAsReported'])
        for k,v in [('COUNTY','DEL'),('UNIT_NUM','2'),('STATUS',10),('ADDR_ID',None),('LAST_EDIT_DATE',None)]:
            self.assertIsNone(review(e,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(review(e,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        meta={'id':0,'name':'LBRS Address Points','serviceItemId':ITEM,'geometryType':'esriGeometryPoint','fields':[{'name':k,'type':v,'domain':{'codedValues':[{'code':6,'name':'6 Certified'}] if k=='STATUS' else [{'code':'FRA','name':'Franklin'}] if k=='COUNTY' else []}} for k,v in FIELDS.items()]}
        report=acquire([e,{**e,'key':'foreign','sourceCounty':'39041'}],'2026-11-25',fetch=lambda u,p:meta if u==LAYER else payload,delay=0)
        self.assertEqual(report['counts'],{'candidate':1})
        with self.assertRaises(ValueError):features({**payload,'exceededTransferLimit':True})
