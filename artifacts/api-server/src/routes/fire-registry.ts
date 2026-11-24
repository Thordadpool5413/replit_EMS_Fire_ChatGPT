import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetFireRegistryMatchesQueryParams,
  GetFireRegistryMatchesResponse,
} from "@workspace/api-zod";
import { searchFireRegistryMatches, listNerisDepartments } from "../lib/fireRegistry";

const router: IRouter = Router();

router.get(
  "/fire-registry/matches",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetFireRegistryMatchesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Agency name and a two-letter state code are required.",
      });
      return;
    }

    const stateCode = parsed.data.stateCode.toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }

    try {
      const result = await searchFireRegistryMatches({
        agencyName: parsed.data.agencyName.trim(),
        city: parsed.data.city?.trim() || undefined,
        stateCode,
        fdid: parsed.data.fdid?.trim() || undefined,
      });
      const response = GetFireRegistryMatchesResponse.parse(result);

      if (response.sourceStatuses.some((source) => source.status === "unavailable")) {
        req.log.warn(
          { stateCode },
          "One or more public fire registry sources are unavailable",
        );
      }
      res.json(response);
    } catch (error) {
      req.log.error({ err: error, stateCode }, "Fire registry lookup failed");
      res.status(502).json({
        error: "Public fire registry records are temporarily unavailable.",
      });
    }
  },
);

router.get("/fire-registry/directory", async (req: Request, res: Response): Promise<void> => {
  const stateCode=typeof req.query.stateCode==='string'?req.query.stateCode.trim().toUpperCase():'';
  if(!/^[A-Z]{2}$/.test(stateCode)){res.status(400).json({error:"A two-letter state code is required."});return;}
  try {res.json(await listNerisDepartments(stateCode));}
  catch(error){req.log.warn({err:error,stateCode},"NERIS directory unavailable");res.status(502).json({error:"NERIS state directory is temporarily unavailable."});}
});

export default router;
