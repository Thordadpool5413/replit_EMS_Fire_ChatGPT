import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetNriCountyContextQueryParams,
  GetNriCountyContextResponse,
} from "@workspace/api-zod";
import { getNriCountyContext } from "../lib/nriCountyContext";

const router: IRouter = Router();

router.get(
  "/geography/nri-county-context",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetNriCountyContextQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }

    const stateCode = parsed.data.stateCode?.trim().toUpperCase();
    if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }

    try {
      const response = GetNriCountyContextResponse.parse(
        await getNriCountyContext(stateCode),
      );
      res.json(response);
    } catch (error) {
      req.log.error(
        { err: error, stateCode },
        "FEMA National Risk Index lookup failed",
      );
      res.status(502).json({
        error: "FEMA county risk records are temporarily unavailable.",
      });
    }
  },
);

export default router;
