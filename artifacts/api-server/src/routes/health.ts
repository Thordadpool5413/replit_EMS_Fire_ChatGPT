import { Router, type IRouter, type RequestHandler } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { makeReadinessHandler } from "../lib/releaseReadiness";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

export const apiReadinessHandler: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

router.get("/", apiReadinessHandler);
router.get("/healthz", apiReadinessHandler);
// Verify database connectivity and required workspace columns; never select provider data.
router.get("/readyz", makeReadinessHandler(()=>db.execute(sql`
  select s.sid, a.id, a.revision, p.agency_id, p.identity_key, p.binding,
         p.revision, p.record, p.updated_by, p.updated_at,
         h.agency_id, h.revision, h.identity_key, h.binding, h.record, h.actor_uid, h.created_at,
         i.agency_id, i.binding, i.kind, i.revision, i.digest, i.report, i.author_uid, i.created_at
  from sessions s cross join agency_records a
  cross join working_pipeline p cross join working_pipeline_history h cross join provider_source_snapshots i
  limit 0
`)));

export default router;
