import unittest
from build_neris_station_map import county_for,polygon_location
class CountyPointTests(unittest.TestCase):
    def test_county_bounds_holes_and_ambiguous_edges(self):
        a=[[0,0],[10,0],[10,10],[0,10],[0,0]]
        hole=[[4,4],[6,4],[6,6],[4,6],[4,4]]
        b=[[10,0],[20,0],[20,10],[10,10],[10,0]]
        polygons=[('01001',(0,0,10,10),[a,hole]),('01003',(10,0,20,10),[b])]
        self.assertEqual(county_for([2,2],polygons),('01001','generalized-boundary'))
        self.assertEqual(county_for([2,12],polygons),('01003','generalized-boundary'))
        self.assertEqual(county_for([5,5],polygons),(None,'outside-reported-state-boundaries'))
        self.assertEqual(county_for([5,10],polygons),(None,'ambiguous-boundary'))
        self.assertEqual(county_for(None,polygons),(None,'no-source-coordinate'))
        self.assertEqual(county_for([2,2],polygons+[('01005',(0,0,10,10),[a])]),(None,'ambiguous-boundary'))
