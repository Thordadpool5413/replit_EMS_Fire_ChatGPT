import hashlib,json,pathlib,tempfile,unittest,zipfile
from compile_review_coordinates import read_archive
class CoordinateProvenanceTest(unittest.TestCase):
    def test_archive_requires_exact_bytes_and_member(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/'archive.zip'
            with zipfile.ZipFile(p,'w') as z:z.writestr('review.json',json.dumps({'publication':'review-only'}))
            checksum=hashlib.sha256(p.read_bytes()).hexdigest()
            self.assertEqual(read_archive(p,checksum,'review.json'),{'publication':'review-only'})
            with self.assertRaises(ValueError):read_archive(p,'0'*64,'review.json')
            with self.assertRaises(ValueError):read_archive(p,checksum,'other.json')
            p.write_bytes(p.read_bytes()+b'x')
            with self.assertRaises(ValueError):read_archive(p,checksum,'review.json')
