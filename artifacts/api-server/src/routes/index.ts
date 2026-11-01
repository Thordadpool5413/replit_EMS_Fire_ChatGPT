import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fireRegistryRouter from "./fire-registry";
import territoryRouter from "./territory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fireRegistryRouter);
router.use(territoryRouter);

export default router;
