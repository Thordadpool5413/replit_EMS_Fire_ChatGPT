import { createHash } from 'node:crypto';
import { Router, type IRouter } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { agencyRecordsTable as agencies, db, providerSourceSnapshotsTable as snapshots } from '@workspace/db';
import {
  billingDenialDefinitions, isProviderSourceKind, parseProviderSourceRows, type ProviderSourceKind,
} from '@workspace/api-zod/provider-sources';
import { requireAgencyWorkspace, agencyWorkspaceRole } from '../middlewares/agencyWorkspaceAccess';
import { object } from '../lib/facilityEquipment';
import { pipelineIdentity } from '../lib/workingPipeline';

const router: IRouter = Router();
const path = '/agencies/:agencyId/source-snapshots/:kind';

function scope(agencyId: unknown, kind: unknown) {
  return typeof agencyId === 'string' && agencyId.trim() && agencyId.length <= 300 && isProviderSourceKind(kind)
    ? { agencyId, kind } : undefined;
}
function snapshotScope(agencyId: string, binding: string, kind: ProviderSourceKind) {
  return and(eq(snapshots.agencyId, agencyId), eq(snapshots.binding, binding), eq(snapshots.kind, kind));
}
function cleanLabel(value: unknown) {
  return typeof value === 'string' && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
}
function present(row?: typeof snapshots.$inferSelect) {
  return row ? { ...row.report, revision: row.revision, savedAt: row.createdAt.toISOString() } : null;
}

router.get(path, requireAgencyWorkspace, async (req, res) => {
  const params = scope(req.params.agencyId, req.params.kind);
  if (!params) { res.status(400).json({ error: 'Invalid provider source scope.' }); return; }
  const requested = req.query.revision;
  if (requested !== undefined && (typeof requested !== 'string' || !/^[1-9]\d{0,9}$/.test(requested) || Number(requested) >= 2147483647)) {
    res.status(400).json({ error: 'Invalid source revision.' }); return;
  }
  const uid = req.isAuthenticated() ? req.user.id : '';
  try {
    const result = await db.transaction(async tx => {
      const [agency] = await tx.select().from(agencies).where(eq(agencies.id, params.agencyId)).for('share');
      const identity = agency && pipelineIdentity(agency.payload);
      if (!identity) return null;
      const match = snapshotScope(params.agencyId, identity.binding, params.kind);
      const [row] = await tx.select().from(snapshots)
        .where(requested ? and(match, eq(snapshots.revision, Number(requested))) : match)
        .orderBy(desc(snapshots.revision)).limit(1);
      return { registryKey: identity.key, binding: identity.binding, snapshot: present(row), canWrite: agencyWorkspaceRole(uid) === 'editor' };
    });
    if (requested && result && !result.snapshot) {
      res.status(404).json({ error: 'Source revision not found on the current account.' }); return;
    }
    res.status(result ? 200 : 404).json(result ?? { error: 'Save an account with a native active registry identifier to load source records.' });
  } catch {
    res.status(503).json({ error: 'Private provider source records are temporarily unavailable.' });
  }
});

router.post(path, requireAgencyWorkspace, async (req, res) => {
  const params = scope(req.params.agencyId, req.params.kind);
  const body = object(req.body);
  const source = cleanLabel(body.source);
  const cohort = params?.kind === 'billing' ? cleanLabel(body.cohort) : '';
  const definition = params?.kind === 'billing' ? cleanLabel(body.denialDefinition) : '';
  const { binding, expectedRevision, csv } = body;
  if (!params || !source || typeof binding !== 'string' || !/^[a-f0-9]{64}$/.test(binding) ||
    typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647 ||
    typeof csv !== 'string' || body.attested !== true ||
    (params.kind === 'billing' && (!cohort || !billingDenialDefinitions.some(item => item === definition)))) {
    res.status(400).json({ error: 'Source, authorization attestation, and the current account and snapshot revision are required.' });
    return;
  }
  const uid = req.isAuthenticated() ? req.user.id : '';
  try {
    const result = await db.transaction(async tx => {
      const [agency] = await tx.select().from(agencies).where(eq(agencies.id, params.agencyId)).for('update');
      const identity = agency && pipelineIdentity(agency.payload);
      if (!identity || identity.binding !== binding) return { status: 409, error: 'Account identity changed. Refresh the profile.' };
      let rows;
      try { rows = parseProviderSourceRows(csv, params.kind, identity.key); }
      catch (error) { return { status: 400, error: error instanceof Error ? error.message : 'Invalid CSV.' }; }
      if (params.kind === 'billing' && definition === 'not provided' && rows.some(row => row.initial !== null || row.final !== null)) {
        return { status: 400, error: 'Select the reported denial definition when providing denied counts.' };
      }
      const report = { source, cohort, definition, rows };
      const digest = createHash('sha256').update(JSON.stringify(report)).digest('hex');
      const [latest] = await tx.select().from(snapshots).where(snapshotScope(params.agencyId, binding, params.kind))
        .orderBy(desc(snapshots.revision)).limit(1);
      if (latest?.digest === digest) return { status: 200, snapshot: present(latest) };
      const previous = latest?.revision ?? 0;
      if (previous !== expectedRevision) return { status: 409, error: 'Another revision was saved. Refresh, then review before replacing it.' };
      const [saved] = await tx.insert(snapshots).values({ ...params, binding, revision: previous + 1, digest, report, authorUid: uid }).returning();
      return { status: 201, snapshot: present(saved) };
    });
    res.status(result.status).json(result.error ? { error: result.error } : { snapshot: result.snapshot });
  } catch {
    res.status(503).json({ error: 'Save not confirmed. Retry the same snapshot.' });
  }
});

export default router;
