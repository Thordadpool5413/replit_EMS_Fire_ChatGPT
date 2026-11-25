import unittest
from investigate_address_exceptions import observation,investigate,SOURCES
from unittest.mock import patch
class ExceptionTests(unittest.TestCase):
    def test_literal_fields(self):
        self.assertEqual(observation(None),{'kind':'null'})
        self.assertEqual(observation(''),{'kind':'empty','value':''})
        self.assertEqual(observation(' '),{'kind':'whitespace','value':' '})
        self.assertEqual(observation('None'),{'kind':'reported','value':'None'})
        with self.assertRaises(ValueError):observation('bad\nvalue')
    def test_scope_and_changed_result(self):
        mod,_,_,_,_,reason,fields=SOURCES['PA'];meta={'fixture':True}
        targets=[{'sourceKey':str(i),'status':'review','exactObjectIds':[i+1],'reasons':[reason]} for i in range(9)]
        entries=[{'key':str(i),'state':'PA','status':'no-match','match':None,'sourceCounty':'42017','address':{'street':'123 Main Street','city':'Example','state':'PA','zip':'18901'}} for i in range(9)]
        report={'publication':'review-only','sourceUrl':mod.LAYER,'candidates':[],'diagnostics':targets,'sourceMetadata':meta}
        feature={'attributes':{'OBJECTID':1,**{k:None for k in fields},'gc_excepti':'literal fixture'}}
        with patch.object(mod,'metadata',return_value=meta),patch.object(mod,'features',return_value=[feature]),patch.object(mod,'review',side_effect=[(None,{'exactObjectIds':[1],'status':'review','reasons':[reason]})]+[(None,{'exactObjectIds':[],'status':'noMatch','reasons':['no_exact_address']})]*8):
            r=investigate('PA',report,entries,'2026-11-25',fetch=lambda u,p:{},delay=0)
        self.assertEqual(r['counts'],{'withheld_exact_address':1,'changed_requires_reacquisition':8})
        self.assertEqual(r['rows'][0]['fieldsAsReported']['gc_excepti']['value'],'literal fixture')
        self.assertEqual(r['publicationEligible'],0)
        self.assertEqual(r['requests'],1)
        with self.assertRaises(ValueError):investigate('PA',{**report,'diagnostics':targets[:-1]},entries,'2026-11-25')
