import io,pathlib,tempfile,unittest,zipfile,zlib
from unittest.mock import patch
from checked_zip_member import CheckedMember,decoder_path,open_checked_member

class CheckedZipTests(unittest.TestCase):
 def checked(self,data,size,crc):
  raw=CheckedMember(io.BytesIO(data),size,crc)
  with io.BufferedReader(raw) as stream:
   result=stream.read();raw.verify();return result
 def test_reject_short_oversized_or_corrupt_stream(self):
  a=b'header\ncomplete data\n'
  crc=zlib.crc32(a)
  self.assertEqual(self.checked(a,len(a),crc),a)
  for data,size,expected in [(a[:-1],len(a),crc),(a+b'x',len(a),crc),(a[:-1]+b'x',len(a),crc^0),(a,len(a),crc^1)]:
   with self.assertRaises(ValueError):self.checked(data,size,expected)
 def test_reject_early_consumer_exit(self):
  a=b'abcdef'
  raw=CheckedMember(io.BytesIO(a),len(a),zlib.crc32(a))
  self.assertRaises(ValueError,raw.verify)
 def test_native_zip_validated_stream(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'data.zip';data=b'hello\nworld\n'
   with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('TXT/address.txt',data)
   with zipfile.ZipFile(path) as z:
    with open_checked_member(path,z,z.getinfo('TXT/address.txt')) as stream:self.assertEqual(stream.read(),data)
 @unittest.skipUnless(decoder_path(),'7-Zip installed on bulk-data runner')
 def test_real_7zip_fallback_reads_exact_member(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'data.zip';data=b'hello\nworld\n'
   with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr('TXT/address.txt',data);z.writestr('TXT/other.txt',b'not selected')
   with zipfile.ZipFile(path) as z:
    member=z.getinfo('TXT/address.txt')
    with patch.object(z,'open',side_effect=NotImplementedError('unsupported method')):
     with open_checked_member(path,z,member) as stream:self.assertEqual(stream.read(),data)
if __name__=='__main__':unittest.main()
