import unittest
import stage_pennsylvania_bucks_addresses as bucks
from recover_bucks_whitespace import reconsider,FIELDS
from retain_nj_checkpoint import validate
class RecoveryTests(unittest.TestCase):
    def test_single_space_only_and_all_remaining_gates(self):
        e={'key':'fixture','state':'PA','status':'no-match','sourceCounty':'42017','address':{'street':'123 Main Street','city':'Example','state':'PA','zip':'18901'}}
        a={k:None for k in bucks.FIELDS};a.update(OBJECTID=1,Full_Addr='123 MAIN ST',Post_Code='18901',Post_Comm='EXAMPLE',State='PA',Country='US',County='Bucks',Add_Number='123',Source='Fixture',Site_NGUID='fixture',DateUpdate=1735689600000,Placement='Structure');a.update({k:' ' for k in FIELDS})
        f={'attributes':a,'geometry':{'x':-75.1,'y':40.3}};target={'originalObjectId':1}
        hit,status=reconsider(e,target,[f],'2026-11-25')
        self.assertEqual(status,'candidate');self.assertFalse(hit['publicationEligible']);self.assertEqual(hit['sourceFieldsAsReported']['Unit'],' ');self.assertEqual(a['Unit'],' ')
        for k,v in [('Unit','7'),('Unit','  '),('County','Other'),('Source',None),('DateUpdate',None)]:
            self.assertIsNone(reconsider(e,target,[{**f,'attributes':{**a,k:v}}],'2026-11-25')[0])
        self.assertIsNone(reconsider(e,target,[f,{**f,'attributes':{**a,'OBJECTID':2}}],'2026-11-25')[0])
        self.assertIsNone(reconsider({**e,'address':{**e['address'],'street':'123 Main Street STE 7'}},target,[f],'2026-11-25')[0])
    def test_blocked_checkpoint_cannot_be_retained(self):
        with self.assertRaises(ValueError):validate({'source':'nj-addresspoints','acquisitionStatus':'source-blocked'},[],'fixture')
