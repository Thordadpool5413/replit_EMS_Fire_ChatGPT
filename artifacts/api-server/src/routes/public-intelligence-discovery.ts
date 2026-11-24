import { Router,type IRouter } from 'express';
import { createFemaDiscoveryService,parseDiscoveryQuery } from '../lib/publicIntelligenceDiscovery';
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
export default router;
