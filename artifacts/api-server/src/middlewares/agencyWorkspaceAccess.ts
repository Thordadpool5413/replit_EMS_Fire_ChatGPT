import type { RequestHandler } from "express";

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

function sameOriginRequest(req: Parameters<RequestHandler>[0]): boolean {
  const site = req.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.get("origin");
  if (!origin) return true; // Non-browser clients still need an authorized session.
  try {
    const candidate = new URL(origin);
    const configured = process.env.ATLAS_PUBLIC_ORIGIN;
    if (configured) return candidate.origin === new URL(configured).origin;
    // Replit may terminate TLS and forward the original public host.
    return ["https:", "http:"].includes(candidate.protocol) &&
      [req.get("host"), req.get("x-forwarded-host")].some(host => host === candidate.host);
  } catch { return false; }
}

export const requireAgencyWorkspace: RequestHandler = (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: { code: "cross_origin_denied", message: "Cross-origin private workspace requests are not allowed." } });
    return;
  }
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
};
