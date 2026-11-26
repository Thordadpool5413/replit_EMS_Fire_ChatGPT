import unittest
from retain_nppes_secondary_geocodes import validate_row
class SecondaryGeocodeTests(unittest.TestCase):
    def test_exact_source_and_approximate_coordinates(self):
        p={'sourceKey':'fixture','parentNpi':'1003006180','address':{'street':'123 Main Street STE 4','city':'Example','state':'TX','zip':'75001'},'parentMappingStatus':'no-match'}
        m={'latitude':32.9,'longitude':-96.9,'matchedAddress':'123 MAIN ST, EXAMPLE, TX, 75001','method':'census-address-range'}
        r={**p,'geocodeStatus':'approximate-street-range','sourceGeometry':m,'censusCountyAsReported':'48113','sharedApproximatePoint':False,'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False}
        c={'48113':'TX','39049':'OH'}
        validate_row(r,p,c)
        for change in ({'parentNpi':'1234567893'},{'censusCountyAsReported':'39049'},{'publicationEligible':True},{'stationIdentityEstablished':True},{'sourceGeometry':{**m,'latitude':float('nan')}},{'sourceGeometry':{**m,'matchedAddress':'124 MAIN ST, EXAMPLE, TX, 75001'}},{'sourceGeometry':{**m,'method':'nad-address-point'}},{'geocodeStatus':'no-unique-match'}):
            with self.assertRaises(ValueError):validate_row({**r,**change},p,c)
        validate_row({**r,'geocodeStatus':'no-unique-match','sourceGeometry':None,'censusCountyAsReported':None},p,c)
