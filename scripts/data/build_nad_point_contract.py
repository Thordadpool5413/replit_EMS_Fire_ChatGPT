#!/usr/bin/env python3
"""Generate runtime point bindings only after complete retained NAD replay."""
import json,pathlib,zipfile
from stage_nad_primary import EVIDENCE,ROOT,verify,sha,dump,native_point,native_street

def main():
    verify()
    with zipfile.ZipFile(EVIDENCE/'original.zip') as archive:
        report=json.loads(archive.read('report.json'))
        rows=json.loads(archive.read('native-matches.json'))
    native={int(r['native']['OID_']):r for r in rows}
    points={}
    for candidate in report['candidates']+report['diagnosticCandidates']:
        point=candidate['match']['point'];record=native[point['objectId']];n=record['native'];y,x=native_point(n)
        assert point['nativeRecordSha256']==sha(dump(n)) and point['sourceRowNumber']==record['sourceRowNumber']
        pin=[record['sourceRowNumber'],point['nativeRecordSha256'],y,x,point['authority'],n['Placement'],point['countyFips'],n['County'],n['Lifecycle'],native_street(n),n['State'],candidate['match']['sourceAddress']['zip'],n['Post_City'].strip(),n['Inc_Muni'].strip()]
        key=str(point['objectId'])
        if key in points and points[key]!=pin:raise ValueError('One native NAD point has conflicting publication bindings')
        points[key]=pin
    text='// Generated from the complete, replayed 2026-09-30 native NAD release.\nexport const NAD_NATIVE_POINTS:Record<string,[number,string,number,number,string,string,string,string,string,string,string,string,string,string]>='+json.dumps(points,sort_keys=True,separators=(',',':'))+';\n'
    for relative in ('artifacts/ems-territory-intelligence/src/services/nadPrimaryPointPins.ts','artifacts/api-server/src/lib/nadPrimaryPointPins.ts'):
        (ROOT/relative).write_text(text)
    print('Bound native NAD points:',len(points))

if __name__=='__main__':main()
