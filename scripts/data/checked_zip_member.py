"""Stream a single ZIP member with fail-closed size, CRC and decoder status checks."""
import contextlib,io,pathlib,shutil,subprocess,tempfile,zlib

class CheckedMember(io.RawIOBase):
 def __init__(self,source,size,crc):
  super().__init__();self.source=source;self.size=size;self.crc=crc;self.count=0;self.actual_crc=0;self.eof=False
 def readable(self):return True
 def readinto(self,b):
  n=self.source.readinto(b)
  if n is None:raise ValueError('ZIP decoder produced no read result')
  if not n:self.eof=True;return 0
  self.count+=n
  if self.count>self.size:raise ValueError('ZIP member exceeds declared size')
  self.actual_crc=zlib.crc32(memoryview(b)[:n],self.actual_crc)
  return n
 def verify(self):
  if not self.eof or self.count!=self.size:raise ValueError('ZIP member was not completely decoded')
  if self.actual_crc!=self.crc:raise ValueError('ZIP member CRC mismatch')

def decoder_path():
 return shutil.which('7zz') or shutil.which('7z') or shutil.which('unzip')

@contextlib.contextmanager
def open_checked_member(archive,z,member):
 # Never extract a 42GB temporary file. Fallback only for an unsupported codec,
 # not for malformed archives, CRC failures, or other native ZIP errors.
 if member.flag_bits&1 or member.is_dir() or not 0<member.file_size<=70_000_000_000:
  raise ValueError('Invalid ZIP member bounds')
 try:raw=z.open(member)
 except NotImplementedError:
  raw=None
 if raw is not None:
  with raw:
   checked=CheckedMember(raw,member.file_size,member.CRC)
   with io.BufferedReader(checked,buffer_size=1024*1024) as stream:
    yield stream
    checked.verify()
  return
 decoder=decoder_path()
 if not decoder:raise RuntimeError('ZIP compression method '+str(member.compress_type)+' requires a supported native ZIP decoder')
 # A literal, unique member path; disable wildcard expansion and archive extraction to disk.
 if sum(i.filename==member.filename for i in z.infolist())!=1 or not member.filename or any(ord(c)<32 for c in member.filename) or member.filename.startswith(('-','@')):
  raise ValueError('Unsafe or duplicate ZIP member name')
 is_unzip=pathlib.Path(decoder).name=='unzip'
 if is_unzip and any(c in member.filename for c in '*?[]'):raise ValueError('Info-ZIP requires a literal member name')
 command=([decoder,'-p',str(pathlib.Path(archive).resolve()),member.filename] if is_unzip else
          [decoder,'x','-so','-bd','-bb0','-bso0','-bsp0','-bse2','-spd','--',str(pathlib.Path(archive).resolve()),member.filename])
 print('Streaming ZIP compression method',member.compress_type,'through native decoder; expected bytes',member.file_size,flush=True)
 with tempfile.TemporaryFile() as errors:
  proc=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=errors)
  try:
   with proc.stdout:
    checked=CheckedMember(proc.stdout,member.file_size,member.CRC)
    with io.BufferedReader(checked,buffer_size=1024*1024) as stream:
     yield stream
     checked.verify()
   status=proc.wait(timeout=60)
   if status:
    errors.seek(0)
    raise ValueError('Native ZIP decoder failed (exit '+str(status)+'): '+errors.read(500).decode('utf-8','replace'))
  finally:
   if proc.poll() is None:
    proc.kill();proc.wait(timeout=60)
