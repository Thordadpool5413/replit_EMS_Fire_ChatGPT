import assert from "node:assert/strict";
import test from "node:test";
import { canReadAgencyWorkspaceFields, requireAgencyWorkspace } from "./agencyWorkspaceAccess";

function runAccessCheck(options: {
  method: string;
  userId?: string;
  headers?: Record<string, string>;
}) {
  const result: { status?: number; body?: unknown; next: boolean } = { next: false };
  const req = {
    method: options.method,
    user: options.userId ? { id: options.userId } : undefined,
    isAuthenticated: () => Boolean(options.userId),
    get: (name: string) => options.headers?.[name.toLowerCase()],
  };
  const res = {
    set: () => res,
    status: (status: number) => {
      result.status = status;
      return res;
    },
    json: (body: unknown) => {
      result.body = body;
      return res;
    },
  };

  requireAgencyWorkspace(
    req as never,
    res as never,
    () => { result.next = true; },
  );
  return result;
}

test("agency writes still require sign-in and editor membership", () => {
  process.env.ATLAS_AGENCY_EDITOR_IDS = "agency-editor";
  process.env.ATLAS_AGENCY_VIEWER_IDS = "agency-viewer";

  assert.equal(runAccessCheck({ method: "PUT" }).status, 401);
  assert.equal(runAccessCheck({ method: "PUT", userId: "agency-viewer" }).status, 403);
  assert.equal(runAccessCheck({ method: "PUT", userId: "agency-editor" }).next, true);
  assert.equal(runAccessCheck({
    method: "PUT",
    userId: "agency-editor",
    headers: { origin: "https://other.example", "sec-fetch-site": "cross-site" },
  }).status, 403);

  delete process.env.ATLAS_AGENCY_EDITOR_IDS;
  delete process.env.ATLAS_AGENCY_VIEWER_IDS;
});

test("private profile fields require a same-origin authorized reader", () => {
  process.env.ATLAS_AGENCY_VIEWER_IDS = "agency-viewer";

  const sameOrigin = {
    origin: "https://app.example",
    "sec-fetch-site": "same-origin",
    host: "app.example",
  };
  assert.equal(canReadAgencyWorkspaceFields({
    isAuthenticated: () => true,
    user: { id: "agency-viewer" },
    get: (name: string) => sameOrigin[name as keyof typeof sameOrigin],
  } as never), true);
  assert.equal(canReadAgencyWorkspaceFields({
    isAuthenticated: () => true,
    user: { id: "agency-viewer" },
    get: (name: string) => name === "origin" ? "https://other.example" : "cross-site",
  } as never), false);

  delete process.env.ATLAS_AGENCY_VIEWER_IDS;
});
