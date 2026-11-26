#!/usr/bin/env python3
"""Discover public provider point layers from the official DSHS map, without guessing location semantics."""
import argparse,datetime,json,pathlib,re,urllib.parse
from stage_wisconsin_addresses import request
APP='37919c1a7c3845c5ad1ad27d4b6b1bb6'
PORTAL='https://txdshsea.maps.arcgis.com/sharing/rest/content/items/'
REFERENCE='https://www.dshs.texas.gov/dshs-ems-trauma-systems/ems-trauma-systems-interactive-map'
ID=re.compile(r'^[a-f0-9]{32}$')
SERVICE=re.compile(r'^https://services[0-9]*\.arcgis\.com/[A-Za-z0-9]+/arcgis/rest/services/[A-Za-z0-9_]+/(?:FeatureServer|MapServer)(?:/[0-9]{1,4})?/?$',re.I)
def item(id,kind,fetch):
    if not isinstance(id,str) or not ID.fullmatch(id):raise ValueError('Invalid item identity')
    meta=fetch(PORTAL+id,{'f':'json'})
    if meta.get('id')!=id or meta.get('type')!=kind or meta.get('access')!='public':raise ValueError('Unexpected official map item')
    return meta,fetch(PORTAL+id+'/data',{'f':'json'})
def text(v):
    return v if isinstance(v,str) and 0<len(v)<=400 and not re.search(r'[\x00-\x1f\x7f]',v) else None
def summary(meta):
    return {k:meta.get(k) for k in ('id','type','title','owner','orgId','modified','access')}
def layers(items,depth=0):
    if depth>5 or not isinstance(items,list) or len(items)>200:raise ValueError('Unexpected map layer hierarchy')
    for l in items:
        if not isinstance(l,dict):raise ValueError('Unexpected map layer')
        yield l
        if 'layers' in l:yield from layers(l['layers'],depth+1)
def relevant(title):
    return bool(re.search(r'\b(?:ems|emergency medical|ambulance)\b',title,re.I) and re.search(r'\b(?:provider|providers|station|stations|ground|air)\b',title,re.I))
def layer_info(url,fetch):
    if not SERVICE.fullmatch(url):raise ValueError('Unreviewed ArcGIS service URL')
    meta=fetch(url,{'f':'json'})
    if not meta.get('geometryType') and not re.search(r'/\d+/?$',url):
        children=meta.get('layers',[])
        if not isinstance(children,list) or len(children)>100:raise ValueError('Unreviewed service layer list')
        chosen=[]
        for l in children:
            if not isinstance(l,dict):raise ValueError('Malformed layer list')
            if relevant(text(l.get('name')) or '') and type(l.get('id')) is int and 0<=l['id']<=9999:
                chosen.extend(layer_info(url.rstrip('/')+'/'+str(l['id']),fetch))
        return chosen
    fields=meta.get('fields',[])
    if not isinstance(fields,list) or len(fields)>200:raise ValueError('Unexpected field list')
    names=[]
    for f in fields:
        if not isinstance(f,dict) or not text(f.get('name')) or not text(f.get('type')):raise ValueError('Unexpected source field')
        names.append({'name':f['name'],'alias':text(f.get('alias')),'type':f['type']})
    if len({f['name'].lower() for f in names})!=len(names):raise ValueError('Ambiguous field names')
    point=meta.get('geometryType')=='esriGeometryPoint'
    count=None
    if point and 'Query' in str(meta.get('capabilities','')).split(','):
        q=fetch(url.rstrip('/')+'/query',{'f':'json','where':'1=1','returnCountOnly':'true'})
        count=q.get('count')
        if type(count) is not int or not 0<=count<=1000000:raise ValueError('Unexpected provider point count')
    return [{'sourceUrl':url,'layerId':meta.get('id'),'name':text(meta.get('name')),'serviceItemId':meta.get('serviceItemId'),'copyrightText':text(meta.get('copyrightText')),'geometryType':meta.get('geometryType'),'objectIdField':meta.get('objectIdField'),'lastEditDate':(meta.get('editingInfo') or {}).get('lastEditDate'),'fields':names,'reportedFeatureCount':count,'publicationEligible':False}]
def discover(fetch=request):
    app,config=item(APP,'Web Mapping Application',fetch)
    map_id=(config.get('map') or {}).get('itemId')
    webmap,data=item(map_id,'Web Map',fetch)
    org=app.get('orgId')
    if org and webmap.get('orgId') and webmap['orgId']!=org:raise ValueError('Map owner organization differs')
    inventory=[];selected=[];seen=set()
    for layer in layers(data.get('operationalLayers',[])):
        title=text(layer.get('title')) or text(layer.get('name')) or ''
        url=layer.get('url');inventory.append({'title':title,'layerType':text(layer.get('layerType')),'providerLayerCandidate':relevant(title)})
        if not relevant(title) or not isinstance(url,str) or url in seen:continue
        seen.add(url)
        if not SERVICE.fullmatch(url):
            selected.append({'mapLayerTitle':title,'status':'service-url-requires-review','publicationEligible':False});continue
        try:
            for info in layer_info(url,fetch):selected.append({'mapLayerTitle':title,'status':'metadata-reviewed',**info})
        except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
            selected.append({'mapLayerTitle':title,'status':'source-unavailable-or-unreviewed','errorType':type(exc).__name__,'publicationEligible':False})
    return {'schemaVersion':1,'referenceUrl':REFERENCE,'application':summary(app),'webMap':summary(webmap),'inventory':inventory,'providerLayers':selected,'publication':'metadata-only','endUserValidationRequired':True,'newMapped':0}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    report=discover();report['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'texas-provider-map-sources.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Texas official map source discovery:',json.dumps({'webMapId':report['webMap']['id'],'providerLayers':[{k:v for k,v in l.items() if k in ('mapLayerTitle','status','sourceUrl','name','geometryType','reportedFeatureCount','fields','lastEditDate','serviceItemId')} for l in report['providerLayers']],'newMapped':0}))
    if not any(l.get('status')=='metadata-reviewed' and l.get('geometryType')=='esriGeometryPoint' and type(l.get('reportedFeatureCount')) is int for l in report['providerLayers']):raise ValueError('No queryable provider point layer established')
if __name__=='__main__':main()
