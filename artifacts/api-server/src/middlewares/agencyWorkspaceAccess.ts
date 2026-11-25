import type { RequestHandler } from "express";
import { privateBrowserBoundary } from "./browserOrigin";

// Saved accounts are a single private, shared workspace. No self-enrollment.
export type AgencyWorkspaceRole = "viewer" | "editor";
function ids(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean));
}
export function agencyWorkspaceRole(userId: string): AgencyWorkspaceRole | undefined {
  if (ids(process.env.ATLAS_AGENCY_EDITOR_IDS).has(userId)) return "editor";
  if (ids(process.env.ATLAS_AGENCY_VIEWER_IDS).has(userId)) return "viewer";
  return undefined;
}

export const requireAgencyWorkspace: RequestHandler = (req, res, next) => {
  privateBrowserBoundary(req, res, () => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: { code: "sign_in_required", message: "Sign in with your Replit workspace account to access saved agencies." } });
    return;
  }
  const role = agencyWorkspaceRole(req.user.id);
  if (!role) {
    res.status(403).json({ error: { code: "workspace_access_required", message: "Saved-agency access requires explicit administrator authorization." } });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD" && role !== "editor") {
    res.status(403).json({ error: { code: "editor_required", message: "Editor access is required to change saved agencies." } });
    return;
  }
  next();
  });
};
