import { Router, type IRouter, type Request, type Response } from "express";
import { GetFloridaOfficialAgenciesResponse } from "@workspace/api-zod";
import { getFloridaOfficialAgencies } from "../lib/floridaOfficialData";

const router: IRouter = Router();

router.get(
  "/florida/official-agencies",
  async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === "true";
    try {
      const result = await getFloridaOfficialAgencies(forceRefresh);
      res.json(GetFloridaOfficialAgenciesResponse.parse(result));
    } catch (error) {
      req.log.error({ err: error }, "Florida official agency source lookup failed");
      res.status(502).json({
        error: "The Florida source records could not be validated. No partial profile data was returned.",
      });
    }
  },
);

export default router;
