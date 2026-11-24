import { Router,type IRouter } from 'express';
import { createFemaDiscoveryService,parseDiscoveryQuery } from '../lib/publicIntelligenceDiscovery';
import {createFederalDiscoveryService} from '../lib/federalSpendingDiscovery';
import {parseFederalQuery} from '../lib/federalDiscoveryContract';
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
export default router;
