import unittest
from discover_texas_provider_map import APP,PORTAL,discover
class TexasMapTests(unittest.TestCase):
    def test_discovery_is_bounded_and_metadata_only(self):
        mid='a'*32;url='https://services1.arcgis.com/ABC/arcgis/rest/services/EMS/FeatureServer/0'
        responses={PORTAL+APP:{'id':APP,'type':'Web Mapping Application','access':'public','orgId':'test'},PORTAL+APP+'/data':{'map':{'itemId':mid}},PORTAL+mid:{'id':mid,'type':'Web Map','access':'public','orgId':'test'},PORTAL+mid+'/data':{'operationalLayers':[{'title':'EMS Ground Providers','url':url},{'title':'EMS Air Providers','url':'https://unreviewed.example/point'},{'title':'Hospitals','url':url}]},url:{'geometryType':'esriGeometryPoint','capabilities':'Query','id':0,'fields':[{'name':'OBJECTID','alias':'ID','type':'esriFieldTypeOID'}]},url+'/query':{'count':24}}
        calls=[]
        def fetch(u,p):
            calls.append((u,p));return responses[u]
        report=discover(fetch)
        self.assertEqual(report['providerLayers'][0]['reportedFeatureCount'],24)
        self.assertEqual(report['providerLayers'][1]['status'],'service-url-requires-review')
        self.assertEqual(report['newMapped'],0)
        self.assertFalse(report['providerLayers'][0]['publicationEligible'])
        self.assertEqual([p for u,p in calls if u.endswith('/query')],[{'f':'json','where':'1=1','returnCountOnly':'true'}])
        responses[PORTAL+mid]['access']='private'
        with self.assertRaises(ValueError):discover(fetch)
