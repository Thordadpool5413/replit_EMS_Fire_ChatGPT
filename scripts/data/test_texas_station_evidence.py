import unittest
from acquire_texas_station_evidence import FIELDS,review,features,roster_index
class StationEvidenceTests(unittest.TestCase):
    def fixture(self):
        a={k:None for k in FIELDS}
        a.update(ObjectID=1,USER_License_Number=123456,USER_Primary_Name='Example EMS',USER_License_Type='Emergency Medical Service Provider',USER_Mailing_Address_1='500 Other Road',USER_Mailing_City='Example',USER_Mailing_State='TX',USER_Mailing_Zip='75001',IN_Address='123 Main Street',IN_City='Example',IN_Region='TX',IN_Postal='75001',StAddr='123 MAIN ST',City='EXAMPLE',RegionAbbr='TX',Postal='75001',Status='M',Addr_type='PointAddress',Score=100)
        f={'attributes':a,'geometry':{'longitude':-97.0,'latitude':32.8}}
        p={'sourceKey':'TX-DSHS:license:123456','name':'Example EMS','dbaName':None,'licenseType':'Emergency Medical Service Provider','licenseDateConflict':False}
        return f,{'123456':[p]}
    def test_review_gates(self):
        f,idx=self.fixture();r=review(f,idx)
        self.assertEqual(r['reviewStatus'],'historical_point_requires_validation')
        self.assertFalse(r['publicationEligible']);self.assertFalse(r['stationIdentityEstablished']);self.assertIsNone(r['stationIdentifier'])
        for change in ({'USER_Mailing_Address_1':'123 MAIN ST'},{'Addr_type':'StreetAddress'},{'IN_Address2':'Suite 7'},{'Score':99},{'USER_License_Number':123457},{'USER_Primary_Name':'Different'},{'USER_License_Type':'Other'}):
            self.assertEqual(review({**f,'attributes':{**f['attributes'],**change}},idx)['reviewStatus'],'withheld')
        self.assertIsNone(review(f,{'0123456':idx['123456']})['parentReviewKey'])
        self.assertEqual(review(f,{'123456':[{**idx['123456'][0],'licenseDateConflict':True}]})['associationStatus'],'current_roster_date_conflict')
    def test_feature_membership(self):
        f,_=self.fixture();p={'features':[{**f,'geometry':{'x':-97,'y':32.8}}],'spatialReference':{'wkid':4326}}
        self.assertEqual(set(features(p,[1])),{1})
        with self.assertRaises(ValueError):features(p,[2])
        with self.assertRaises(ValueError):features({**p,'exceededTransferLimit':True},[1])
        with self.assertRaises(ValueError):features({**p,'features':[{**p['features'][0],'attributes':{**f['attributes'],'Phone':'not allowed'}}]},[1])
