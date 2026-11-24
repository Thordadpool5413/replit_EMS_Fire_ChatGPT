import { Router, type IRouter } from "express";
import discoveryRouter from './public-intelligence-discovery';
import healthRouter from "./health";
import fireRegistryRouter from "./fire-registry";
import emsRegistryRouter from "./ems-registry";
import territoryRouter from "./territory";
import nriCountyContextRouter from "./nri-county-context";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(fireRegistryRouter);
router.use(emsRegistryRouter);
router.use(territoryRouter);
router.use(nriCountyContextRouter);

export default router;
