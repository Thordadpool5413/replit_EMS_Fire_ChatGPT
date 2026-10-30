import { Router, type IRouter } from "express";
import healthRouter from "./health";
import floridaRouter from "./florida";
import territoryRouter from "./territory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(floridaRouter);
router.use(territoryRouter);

export default router;
