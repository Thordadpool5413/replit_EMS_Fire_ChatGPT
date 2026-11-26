"""Keep the immutable pre-recovery primary snapshot for earlier evidence editions."""
import contextlib,json,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,sha
BASELINE=ROOT/'scripts/data/evidence/primary-location-baseline/2026-11-26.zip'
def validate(files):
    index=json.loads(files['index.json'])
    expected={'index.json',*(s+'.json' for s in STATES)}
    if set(files)!=expected or {c['file'] for c in index['chunks']}!=expected-{'index.json'}:raise ValueError('Incomplete historical primary snapshot')
    if any(sha(files[c['file']])!=c['sha256'] for c in index['chunks']):raise ValueError('Historical primary shard integrity failure')
def freeze(location):
    if BASELINE.exists():return
    files={k:(location/k).read_bytes() for k in ['index.json',*(s+'.json' for s in sorted(STATES))]}
    validate(files)
    # Earlier retained secondary archive explicitly pins this pre-recovery index.
    source=json.loads((PUBLIC/'nppes-secondary/index.json').read_bytes())
    if sha(files['index.json'])!=source['locationManifestSha256']:raise ValueError('Baseline does not match retained historical evidence')
    BASELINE.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(BASELINE,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for k,v in sorted(files.items()):
            info=zipfile.ZipInfo(k,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,v)
@contextlib.contextmanager
def historical_primary():
    if not BASELINE.exists():
        yield PUBLIC/'locations';return
    with zipfile.ZipFile(BASELINE) as z:
        if len(z.infolist())!=52 or len(set(z.namelist()))!=52 or any(m.is_dir() or m.file_size>12_000_000 for m in z.infolist()):raise ValueError('Invalid historical archive')
        files={m.filename:z.read(m) for m in z.infolist()}
    validate(files)
    source=json.loads((PUBLIC/'nppes-secondary/index.json').read_bytes())
    if sha(files['index.json'])!=source['locationManifestSha256']:raise ValueError('Historical source digest changed')
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)
        for k,v in files.items():(p/k).write_bytes(v)
        yield p
