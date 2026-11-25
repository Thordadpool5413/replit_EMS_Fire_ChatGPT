import pathlib,tempfile,unittest
from verify_retained_coordinate_evidence import verify,EVIDENCE
class RetainedEvidenceTest(unittest.TestCase):
    def test_verified_exact_archive_report(self):
        self.assertEqual(len(verify()['candidates']),72)
    def test_modified_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/'changed.json';p.write_bytes(EVIDENCE.read_bytes()+b' ')
            with self.assertRaises(ValueError):verify(p)
