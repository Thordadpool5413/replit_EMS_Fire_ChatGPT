import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";

/** Private browser requests must be same-origin; never trust caller-supplied forwarded host headers. */
export function allowedBrowserOrigin(origin: unknown, host: unknown, configured = process.env.ATLAS_PUBLIC_ORIGIN): boolean {
  if (typeof origin !== "string" || origin.length > 2048) return false;
  try {
    const candidate = new URL(origin);
    if (!["https:", "http:"].includes(candidate.protocol) || candidate.origin !== origin) return false;
    if (configured) {
      const expected = new URL(configured);
      return ["https:", "http:"].includes(expected.protocol) && expected.origin === configured.replace(/\/$/, "") && candidate.origin === expected.origin;
    }
    return typeof host === "string" && candidate.host === host.toLowerCase();
  } catch { return false; }
}
export function sameOriginRequest(headers: IncomingHttpHeaders, configured = process.env.ATLAS_PUBLIC_ORIGIN): boolean {
  const site = headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") return false;
  const origin = headers.origin;
  return origin === undefined || allowedBrowserOrigin(origin, headers.host, configured);
}
export const privateBrowserBoundary: RequestHandler = (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (!sameOriginRequest(req.headers)) {
    res.status(403).json({ error: { code: "cross_origin_denied", message: "Cross-origin private workspace requests are not allowed." } });
    return;
  }
  next();
};
