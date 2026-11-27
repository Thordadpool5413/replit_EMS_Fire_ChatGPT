import coachRouter from './discovery-coach';
import { Router, type IRouter } from "express";
import discoveryRouter from './public-intelligence-discovery';
import healthRouter from "./health";
import fireRegistryRouter from "./fire-registry";
import emsRegistryRouter from "./ems-registry";
import territoryRouter from "./territory";
import nriCountyContextRouter from "./nri-county-context";
import agencyRecordsRouter from "./agency-records";
import facilityNotesRouter from "./facility-notes";
import facilityEquipmentRouter from "./facility-equipment";
import providerSourceRouter from "./provider-sources";
import authorityRouter from "./agency-authority";
import sharedEvidenceRouter from "./shared-evidence";
import workingPipelineRouter from "./working-pipeline";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coachRouter);
router.use(discoveryRouter);
router.use(fireRegistryRouter);
router.use(emsRegistryRouter);
router.use(territoryRouter);
router.use(nriCountyContextRouter);
router.use(facilityNotesRouter);
router.use(facilityEquipmentRouter);
router.use(authorityRouter);
router.use(providerSourceRouter);
router.use(workingPipelineRouter);
router.use(agencyRecordsRouter);
router.use(sharedEvidenceRouter);
router.use(authRouter);

export default router;
