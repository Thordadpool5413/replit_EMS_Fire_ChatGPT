import { Router,type IRouter } from 'express';
import { createFemaDiscoveryService,parseDiscoveryQuery } from '../lib/publicIntelligenceDiscovery';
import {createFederalDiscoveryService} from '../lib/federalSpendingDiscovery';
import {parseFederalQuery} from '../lib/federalDiscoveryContract';
import {createMunicipalDiscoveryService} from '../lib/municipalSpendingDiscovery';
import {parseMunicipalQuery} from '../lib/municipalDiscoveryContract';
import {authorizedSamGateway,readSamConfig,createSamDiscoveryService,SamDiscoveryError} from '../lib/samSolicitationDiscovery';
import {parseSamQuery} from '../lib/samDiscoveryContract';
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
export default router;
