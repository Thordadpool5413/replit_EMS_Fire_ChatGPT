import { Router,type IRouter } from 'express';
import { createFemaDiscoveryService,parseDiscoveryQuery } from '../lib/publicIntelligenceDiscovery';
import {createFederalDiscoveryService} from '../lib/federalSpendingDiscovery';
import {parseFederalQuery} from '../lib/federalDiscoveryContract';
import {createMunicipalDiscoveryService} from '../lib/municipalSpendingDiscovery';
import {parseMunicipalQuery} from '../lib/municipalDiscoveryContract';
import {authorizedSamGateway,readSamConfig,createSamDiscoveryService,SamDiscoveryError} from '../lib/samSolicitationDiscovery';
import {parseSamQuery} from '../lib/samDiscoveryContract';
import {boundedJson} from '../lib/publicIntelligenceDiscovery';
import {FEED_SOURCE_URL,validateDiscoveryFeed} from '../lib/recurringDiscoveryContract';
import {createChicagoDiscoveryService} from '../lib/chicagoDiscovery';
import {parseChicagoQuery} from '../lib/chicagoDiscoveryContract';
import {fetchNppesLocation,fetchCensusLocation,boundedLocationService} from '../lib/providerLocation';
import {validNpi,parseStreetAddress,isPhysicalStreet,addressKey} from '../lib/providerLocationContract';
import {fetchCmsAmbulanceEvidence} from '../lib/cmsAmbulanceEvidence';
const router:IRouter=Router();
const discover=createFemaDiscoveryService();
router.get('/discovery/fema',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const q=parseDiscoveryQuery(req.query);
 if(!q){res.status(400).json({error:'Choose a valid state, fiscal year (2010 or later), and page offset.'});return;}
 try{res.json(await discover(q));}
 catch(error){
  req.log.warn({err:error},'Public grant discovery unavailable');
  res.status(502).json({error:'OpenFEMA discovery is unavailable or its response could not be verified. No records were inferred.'});
 }
});
const federal=createFederalDiscoveryService();
router.get('/discovery/federal',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const q=parseFederalQuery(req.query);
 if(!q){res.status(400).json({error:'Choose a valid recipient state, start year, topic and page.'});return;}
 try{res.json(await federal(q));}catch(error){req.log.warn({err:error},'Federal award discovery unavailable');res.status(502).json({error:'USAspending discovery is unavailable or returned an invalid response. No awards were inferred.'});}
});
const municipal=createMunicipalDiscoveryService();
router.get('/discovery/municipal',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const q=parseMunicipalQuery(req.query);
 if(!q){res.status(400).json({error:'Choose a supported municipal source, topic, publication window and page.'});return;}
 try{res.json(await municipal(q));}catch(error){req.log.warn({err:error},'Municipal notice discovery unavailable');res.status(502).json({error:'City Record discovery is unavailable or returned an invalid response. No procurement records were inferred.'});}
});
const samConfig=readSamConfig(process.env);
const sam=samConfig?createSamDiscoveryService(samConfig):undefined;
router.get('/discovery/sam',async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(!sam||!samConfig){res.status(503).json({error:'SAM.gov discovery is not configured.'});return;}
 if(!authorizedSamGateway(samConfig,req.get('x-atlas-sam-gateway-token'),req.get('sec-fetch-site'))){res.status(403).json({error:'An authorized gateway is required.'});return;}
 const q=parseSamQuery(req.query);
 if(!q){res.status(400).json({error:'Choose a supported notice type, title topic, location and page.'});return;}
 try{res.json(await sam(q));}catch(error){
  // Do not log the upstream error, URL, response or API key.
  if(error instanceof SamDiscoveryError&&error.category==='quota'){res.status(429).json({error:'SAM.gov request budget reached.'});return;}
  req.log.warn('SAM.gov discovery unavailable');res.status(502).json({error:'SAM.gov could not confirm a notice page. No records were inferred.'});
 }
});
router.get('/discovery/feed',async(req,res)=>{
 res.set('Cache-Control','no-store');
 try{
  const response=await fetch(FEED_SOURCE_URL,{headers:{Accept:'application/json, text/plain'},redirect:'error',signal:AbortSignal.timeout(10_000)});
  if(response.status===404){res.status(503).json({error:'The recurring discovery feed has not been initialized.'});return;}
  if(!response.ok)throw Error('Feed unavailable.');
  // GitHub raw serves JSON as text/plain. Preserve the shared streaming size limit.
  const page=await boundedJson(new Response(response.body,{status:response.status,headers:{'content-type':'application/json','content-length':response.headers.get('content-length')??'0'}}),'ATLAS feed');
  res.json(validateDiscoveryFeed(page));
 }catch{req.log.warn('Recurring public discovery feed unavailable');res.status(502).json({error:'Discovery feed unavailable or invalid. No new records were inferred.'});}
});
const chicago=createChicagoDiscoveryService();
router.get('/discovery/chicago',async(req,res)=>{
 res.set('Cache-Control','no-store');const q=parseChicagoQuery(req.query);
 if(!q){res.status(400).json({error:'Choose a supported contract topic, approval window and page.'});return;}
 try{res.json(await chicago(q));}catch{req.log.warn('Chicago contract discovery unavailable');res.status(502).json({error:'Chicago contract source unavailable or invalid. No records were inferred.'});}
});
const npiAddress=boundedLocationService((npi:string)=>fetchNppesLocation(npi),npi=>npi);
const streetLocation=boundedLocationService(fetchCensusLocation,addressKey);
router.get('/discovery/provider-address',async(req,res)=>{
 res.set('Cache-Control','no-store');const npi=req.query.npi;
 if(!validNpi(npi)||Object.keys(req.query).length!==1){res.status(400).json({error:'Valid organization NPI required.'});return;}
 try{res.json(await npiAddress(npi));}catch{req.log.warn('Provider address lookup unavailable');res.status(502).json({error:'Public registry address unavailable.'});}
});
router.get('/discovery/address-location',async(req,res)=>{
 res.set('Cache-Control','no-store');const a=parseStreetAddress(req.query);
 if(!a||!a.zip||Object.keys(req.query).some(k=>!['street','city','state','zip'].includes(k))||!isPhysicalStreet(a.street)){res.status(400).json({error:'A complete physical street address is required.'});return;}
 try{res.json(await streetLocation(a));}catch{req.log.warn('Street location lookup unavailable');res.status(502).json({error:'Street location service unavailable.'});}
});
const cmsAmbulance=boundedLocationService((npi:string)=>fetchCmsAmbulanceEvidence(npi),npi=>npi);
router.get('/discovery/cms-ambulance-services',async(req,res)=>{
 res.set('Cache-Control','no-store');const npi=req.query.npi;
 if(!validNpi(npi)||Object.keys(req.query).length!==1){res.status(400).json({error:'Valid NPI required.'});return;}
 try{res.json(await cmsAmbulance(npi));}catch{req.log.warn('CMS public ambulance service lookup unavailable');res.status(502).json({error:'CMS service evidence unavailable; no records inferred.'});}
});
export default router;
